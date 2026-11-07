-- The private ElevenLabs agent and conversation bound to one voice or avatar session.
-- Same gate as every other write: user JWT (RLS) plus the server-only write key, so a student calling the API
-- directly can neither read nor write these ids. One row per session, claimed atomically by the primary key:
-- a repeated click or a second tab loses the race and cannot create a second paid agent.
create table public.session_conversations (
  session_id uuid primary key references public.practice_sessions (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  state text not null default 'creating' check (state in ('creating', 'bound')),
  agent_id text check (agent_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  conversation_id text check (conversation_id ~ '^[A-Za-z0-9_-]{8,128}$'),
  created_at timestamptz not null default now(),
  claimed_at timestamptz not null default now(),
  constraint session_conversations_state check (
    (state = 'creating' and conversation_id is null) or (state = 'bound' and agent_id is not null and conversation_id is not null)
  )
);
create unique index session_conversations_conversation_idx on public.session_conversations (conversation_id) where conversation_id is not null;
create unique index session_conversations_agent_idx on public.session_conversations (agent_id) where agent_id is not null;

create function public.session_conversations_guard() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  s public.practice_sessions;
begin
  select * into s from public.practice_sessions where id = new.session_id;
  if not found or s.status <> 'active' or s.mode not in ('voice', 'avatar')
     or s.tenant_id <> new.tenant_id or s.student_id <> new.student_id then
    raise exception 'Samtalen kan bare knyttes til en aktiv stemme- eller avatarøkt' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if new.state <> 'creating' or new.agent_id is not null or new.conversation_id is not null then
      raise exception 'Ugyldig starttilstand for samtale' using errcode = '23514';
    end if;
  else
    if (new.session_id, new.tenant_id, new.student_id, new.created_at)
         is distinct from (old.session_id, old.tenant_id, old.student_id, old.created_at) then
      raise exception 'Uforanderlige samtalefelt kan ikke endres' using errcode = '23514';
    end if;
    if old.state = 'bound' then
      raise exception 'Samtalen er allerede bundet' using errcode = '23514';
    end if;
    if old.agent_id is not null and new.agent_id is distinct from old.agent_id then
      raise exception 'Agenten kan ikke byttes' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
create trigger session_conversations_guard before insert or update on public.session_conversations
  for each row execute function public.session_conversations_guard();

alter table public.session_conversations enable row level security;

create policy session_conversations_select on public.session_conversations for select to authenticated
  using (
    (select public.app_server_write())
    and student_id = (select auth.uid()) and tenant_id = (select public.app_tenant())
  );
create policy session_conversations_insert on public.session_conversations for insert to authenticated
  with check (
    (select public.app_server_write())
    and student_id = (select auth.uid()) and tenant_id = (select public.app_tenant())
  );
create policy session_conversations_update on public.session_conversations for update to authenticated
  using (
    (select public.app_server_write())
    and student_id = (select auth.uid()) and tenant_id = (select public.app_tenant())
  ) with check (
    (select public.app_server_write())
    and student_id = (select auth.uid()) and tenant_id = (select public.app_tenant())
  );

revoke all on public.session_conversations from anon, authenticated;
grant select, insert (session_id, tenant_id, student_id) on public.session_conversations to authenticated;
grant update (state, agent_id, conversation_id, claimed_at) on public.session_conversations to authenticated;
