-- User JWT + server-only write key are both required. The key does not bypass RLS:
-- even the backend can write only the caller's tenant and owned rows.
create schema muntlig_private;
revoke all on schema muntlig_private from public, anon, authenticated;
create table muntlig_private.write_key (
  singleton boolean primary key default true check (singleton),
  value text not null check (value ~ '^[a-f0-9]{64}$')
);
alter table muntlig_private.write_key enable row level security;
revoke all on muntlig_private.write_key from public, anon, authenticated;
insert into muntlig_private.write_key (value) values (encode(extensions.gen_random_bytes(32), 'hex'));

create function public.app_server_write() returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select coalesce((
      select extensions.digest(value, 'sha256') = extensions.digest(
        nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-muntlig-write-key', 'sha256'
      ) from muntlig_private.write_key where singleton
    ), false)
  $$;
revoke all on function public.app_server_write() from public, anon, authenticated;
grant execute on function public.app_server_write() to authenticated;

alter policy packs_insert on public.packs with check (
  (select public.app_server_write())
  and tenant_id = (select public.app_tenant())
  and created_by = (select auth.uid())
  and (select public.app_role()) = 'teacher' and status = 'draft'
);
alter policy packs_update on public.packs
  using (
    (select public.app_server_write()) and tenant_id = (select public.app_tenant())
    and created_by = (select auth.uid()) and (select public.app_role()) = 'teacher' and status = 'draft'
  ) with check (
    (select public.app_server_write()) and tenant_id = (select public.app_tenant())
    and created_by = (select auth.uid())
  );
alter policy sessions_insert on public.practice_sessions with check (
  (select public.app_server_write())
  and student_id = (select auth.uid()) and tenant_id = (select public.app_tenant())
  and (
    (select public.app_role()) = 'student'
    or ((select public.app_role()) = 'teacher' and exists (
      select 1 from public.packs p where p.id = practice_sessions.pack_id and p.created_by = (select auth.uid())
    ))
  )
);
alter policy sessions_update on public.practice_sessions
  using (
    (select public.app_server_write())
    and student_id = (select auth.uid()) and tenant_id = (select public.app_tenant())
  ) with check (
    (select public.app_server_write())
    and student_id = (select auth.uid()) and tenant_id = (select public.app_tenant())
  );

-- Counter manipulation is a write too; the public RPC may not reset or alter cost limits.
create or replace function public.take_quota(p_scope text, p_limit int, p_seconds int) returns boolean
  language plpgsql security definer set search_path = ''
  as $$
declare
  uid uuid := (select auth.uid());
  win timestamptz;
  got int;
begin
  if uid is null or not public.app_server_write() then
    raise exception 'Bare appserveren kan registrere leverandørkall' using errcode = '42501';
  end if;
  if p_limit < 1 or p_seconds < 1 or char_length(p_scope) not between 1 and 64 then
    raise exception 'Ugyldig kvote' using errcode = '22023';
  end if;
  win := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  delete from public.quota_counters where user_id = uid and window_start < now() - interval '2 days';
  insert into public.quota_counters as q (user_id, scope, window_start, used)
    values (uid, p_scope, win, 1)
    on conflict (user_id, scope, window_start) do update set used = q.used + 1 where q.used < p_limit
    returning q.used into got;
  return got is not null;
end
$$;
