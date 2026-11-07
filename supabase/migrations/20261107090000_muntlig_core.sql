-- Muntlig core schema: tenants, profiles, fagpakker, øvingsøkter, kvoter.
-- Security model: the app talks to Postgres as the signed-in user (no service-role key), so every
-- table below has RLS enabled and explicit grants. Roles and tenants are provisioned by an admin
-- (see supabase/scripts/bootstrap-disposable-users.sql); users can never change them.

-- ---------------------------------------------------------------- tenants and profiles
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  role text not null check (role in ('teacher', 'student')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index profiles_tenant_idx on public.profiles (tenant_id);

-- Security definer so policies can read the caller's own profile without recursing through RLS.
create function public.app_tenant() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select tenant_id from public.profiles where id = (select auth.uid()) $$;

create function public.app_role() returns text
  language sql stable security definer set search_path = ''
  as $$ select role from public.profiles where id = (select auth.uid()) $$;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;

create policy tenants_select on public.tenants for select to authenticated
  using (id = (select public.app_tenant()));

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Column grants make role/tenant immutable for users: only display_name is updatable, nothing is insertable.
revoke all on public.tenants, public.profiles from anon, authenticated;
grant select on public.tenants, public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------- fagpakker
create table public.packs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  subject text not null check (char_length(btrim(subject)) between 1 and 80),
  level text not null check (char_length(btrim(level)) between 1 and 40),
  description text not null check (char_length(description) <= 600),
  minutes int not null check (minutes between 3 and 30),
  goals jsonb not null check (jsonb_typeof(goals) = 'array' and jsonb_array_length(goals) = 3),
  sources jsonb not null check (
    jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 40 and pg_column_size(sources) <= 262144
  ),
  rights text not null check (rights in ('teacher_owned', 'open_license', 'publisher_licensed', 'unknown')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  version int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint packs_publish_state check (
    (status = 'draft' and published_at is null)
    or (status = 'published' and published_at is not null and rights <> 'unknown' and jsonb_array_length(sources) >= 1)
  )
);
create index packs_tenant_status_idx on public.packs (tenant_id, status, created_at desc);
create index packs_creator_idx on public.packs (created_by);

-- Publishing checks source references and freezes the row: published packs can never change or vanish.
create function public.packs_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then
      raise exception 'Publiserte fagpakker kan ikke slettes' using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'published' then
      raise exception 'Publiserte fagpakker kan ikke endres' using errcode = '23514';
    end if;
    if new.id <> old.id or new.tenant_id <> old.tenant_id or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'Uforanderlige felt kan ikke endres' using errcode = '23514';
    end if;
  end if;

  if new.status = 'published' then
    if tg_op = 'INSERT' then
      raise exception 'Nye fagpakker må opprettes som utkast' using errcode = '23514';
    end if;
    if (new.title, new.subject, new.level, new.description, new.minutes, new.rights, new.version)
         is distinct from (old.title, old.subject, old.level, old.description, old.minutes, old.rights, old.version)
       or new.goals is distinct from old.goals or new.sources is distinct from old.sources then
      raise exception 'Innholdet kan ikke endres ved publisering' using errcode = '23514';
    end if;
    if exists (
      select 1 from jsonb_array_elements(new.goals) goal
      where jsonb_typeof(goal -> 'sourceIds') <> 'array'
         or jsonb_array_length(goal -> 'sourceIds') = 0
         or exists (
           select 1 from jsonb_array_elements_text(goal -> 'sourceIds') ref
           where ref not in (select source ->> 'id' from jsonb_array_elements(new.sources) source)
         )
    ) then
      raise exception 'Hvert mål må vise til kilder i fagpakken' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
create trigger packs_guard before insert or update or delete on public.packs
  for each row execute function public.packs_guard();

alter table public.packs enable row level security;

create policy packs_select on public.packs for select to authenticated
  using (
    tenant_id = (select public.app_tenant())
    and (status = 'published' or created_by = (select auth.uid()))
  );
create policy packs_insert on public.packs for insert to authenticated
  with check (
    tenant_id = (select public.app_tenant())
    and created_by = (select auth.uid())
    and (select public.app_role()) = 'teacher'
    and status = 'draft'
  );
create policy packs_update on public.packs for update to authenticated
  using (
    tenant_id = (select public.app_tenant())
    and created_by = (select auth.uid())
    and (select public.app_role()) = 'teacher'
    and status = 'draft'
  )
  with check (
    tenant_id = (select public.app_tenant())
    and created_by = (select auth.uid())
  );

revoke all on public.packs from anon, authenticated;
grant select, insert, update on public.packs to authenticated;

-- ---------------------------------------------------------------- øvingsøkter
-- One row per session; turns and evidence are JSON arrays so each turn is one atomic compare-and-set
-- update on `revision`. Only the owner has any policy (a student, or a teacher in preview mode): no one else can read answers.
create table public.practice_sessions (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  pack_id uuid not null references public.packs (id) on delete restrict,
  pack_version int not null check (pack_version >= 1),
  pack jsonb not null check (jsonb_typeof(pack) = 'object' and pg_column_size(pack) <= 400000),
  mode text not null check (mode in ('text', 'voice', 'avatar')),
  status text not null default 'active' check (status in ('active', 'completed')),
  turns jsonb not null default '[]' check (jsonb_typeof(turns) = 'array' and jsonb_array_length(turns) <= 60),
  evidence jsonb not null default '[]' check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 3),
  active_goal_id text not null check (char_length(active_goal_id) between 1 and 64),
  revision int not null default 0 check (revision >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint sessions_end_state check ((status = 'active') = (ended_at is null))
);
create index practice_sessions_student_idx on public.practice_sessions (student_id, started_at desc);
create index practice_sessions_pack_idx on public.practice_sessions (pack_id);
create index practice_sessions_tenant_idx on public.practice_sessions (tenant_id);

-- Integrity rules that hold no matter which client writes: the pack snapshot equals the published pack,
-- history is append-only, evidence quotes are literal text of the student's own turn, completed is final.
create function public.sessions_guard() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  p public.packs;
  ev jsonb;
  i int;
begin
  if tg_op = 'INSERT' then
    select * into p from public.packs where id = new.pack_id;
    if not found or p.status <> 'published' or p.tenant_id <> new.tenant_id or p.version <> new.pack_version
       or new.pack ->> 'id' is distinct from p.id::text
       or new.pack -> 'goals' is distinct from p.goals
       or new.pack -> 'sources' is distinct from p.sources then
      raise exception 'Økten må starte fra en publisert fagpakke' using errcode = '23514';
    end if;
    if new.status <> 'active' or new.revision <> 0 or jsonb_array_length(new.evidence) <> 0 or jsonb_array_length(new.turns) > 1 then
      raise exception 'Ugyldig starttilstand for økt' using errcode = '23514';
    end if;
    if new.active_goal_id is distinct from (new.pack -> 'goals' -> 0 ->> 'id') then
      raise exception 'Økten må starte på første mål' using errcode = '23514';
    end if;
  else
    if old.status = 'completed' then
      raise exception 'Avsluttede økter kan ikke endres' using errcode = '23514';
    end if;
    if (new.id, new.tenant_id, new.student_id, new.pack_id, new.pack_version, new.mode, new.started_at)
         is distinct from (old.id, old.tenant_id, old.student_id, old.pack_id, old.pack_version, old.mode, old.started_at)
       or new.pack is distinct from old.pack then
      raise exception 'Uforanderlige øktfelt kan ikke endres' using errcode = '23514';
    end if;
    if jsonb_array_length(new.turns) < jsonb_array_length(old.turns) then
      raise exception 'Samtalehistorikk kan ikke forkortes' using errcode = '23514';
    end if;
    for i in 0 .. jsonb_array_length(old.turns) - 1 loop
      if new.turns -> i is distinct from old.turns -> i then
        raise exception 'Samtalehistorikk kan ikke endres' using errcode = '23514';
      end if;
    end loop;
    if not (old.evidence <@ new.evidence) then
      raise exception 'Evidens kan ikke fjernes eller endres' using errcode = '23514';
    end if;
    new.revision := old.revision + 1;
  end if;

  if not exists (select 1 from jsonb_array_elements(new.pack -> 'goals') g where g ->> 'id' = new.active_goal_id) then
    raise exception 'Ukjent aktivt mål' using errcode = '23514';
  end if;

  if exists (
    select 1 from jsonb_array_elements(new.turns) t
    where coalesce(t ->> 'role', '') not in ('user', 'assistant')
       or coalesce(char_length(t ->> 'text'), 0) not between 1 and 2000
       or not exists (select 1 from jsonb_array_elements(new.pack -> 'goals') g where g ->> 'id' = t ->> 'goalId')
  ) then
    raise exception 'Ugyldig samtaletur' using errcode = '23514';
  end if;

  if (select count(distinct e ->> 'goalId') from jsonb_array_elements(new.evidence) e) <> jsonb_array_length(new.evidence) then
    raise exception 'Maks én evidens per mål' using errcode = '23514';
  end if;
  for ev in select * from jsonb_array_elements(new.evidence) loop
    if ev ->> 'status' not in ('independent', 'with_hint')
       or char_length(coalesce(ev ->> 'quote', '')) < 1
       or not exists (
         select 1 from jsonb_array_elements(new.turns) t
         where t ->> 'id' = ev ->> 'turnId'
           and t ->> 'role' = 'user'
           and t ->> 'goalId' = ev ->> 'goalId'
           and position((ev ->> 'quote') in (t ->> 'text')) > 0
       ) then
      raise exception 'Evidens må være et sitat fra elevens eget svar' using errcode = '23514';
    end if;
  end loop;  return new;
end
$$;
create trigger sessions_guard before insert or update on public.practice_sessions
  for each row execute function public.sessions_guard();

alter table public.practice_sessions enable row level security;

create policy sessions_select on public.practice_sessions for select to authenticated
  using (student_id = (select auth.uid()) and tenant_id = (select public.app_tenant()));
create policy sessions_insert on public.practice_sessions for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and tenant_id = (select public.app_tenant())
    and (select public.app_role()) in ('student', 'teacher') -- teachers practise only their own preview sessions
  );
create policy sessions_update on public.practice_sessions for update to authenticated
  using (student_id = (select auth.uid()) and tenant_id = (select public.app_tenant()))
  with check (student_id = (select auth.uid()) and tenant_id = (select public.app_tenant()));

revoke all on public.practice_sessions from anon, authenticated;
grant select, insert on public.practice_sessions to authenticated;
grant update (turns, evidence, active_goal_id, status, ended_at) on public.practice_sessions to authenticated;

-- ---------------------------------------------------------------- kvoter
create table public.quota_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (char_length(scope) between 1 and 64),
  window_start timestamptz not null,
  used int not null default 0 check (used >= 0),
  primary key (user_id, scope, window_start)
);
alter table public.quota_counters enable row level security;
revoke all on public.quota_counters from anon, authenticated;

-- Fixed-window counter. The single INSERT .. ON CONFLICT DO UPDATE .. WHERE is atomic: concurrent calls
-- serialise on the row, and the WHERE stops the increment once the limit is reached.
create function public.take_quota(p_scope text, p_limit int, p_seconds int) returns boolean
  language plpgsql security definer set search_path = ''
  as $$
declare
  uid uuid := (select auth.uid());
  win timestamptz;
  got int;
begin
  if uid is null then
    raise exception 'Ikke innlogget' using errcode = '42501';
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

-- ---------------------------------------------------------------- function privileges
-- Functions are executable by PUBLIC by default; only the RPC and policy helpers are opened, to signed-in users.
revoke all on function public.app_tenant(), public.app_role(), public.take_quota(text, int, int),
  public.packs_guard(), public.sessions_guard() from public, anon, authenticated;
grant execute on function public.app_tenant(), public.app_role(), public.take_quota(text, int, int) to authenticated;