-- A parallel finish may complete the session between createAgent and recordAgent. Recording our own freshly
-- created agent id must stay possible then, so a failed cleanup remains discoverable and retryable.
-- Only the record-only transition is opened after completion; binding a conversation stays closed.
create or replace function public.session_conversations_guard() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  s public.practice_sessions;
begin
  select * into s from public.practice_sessions where id = new.session_id;
  if not found or s.mode not in ('voice', 'avatar')
     or s.tenant_id <> new.tenant_id or s.student_id <> new.student_id then
    raise exception 'Samtalen hører ikke til denne stemme- eller avatarøkten' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if s.status <> 'active' or new.state <> 'creating' or new.agent_id is not null
       or new.conversation_id is not null or new.agent_deleted_at is not null then
      raise exception 'Ugyldig starttilstand for samtale' using errcode = '23514';
    end if;
    return new;
  end if;
  if (new.session_id, new.tenant_id, new.student_id, new.created_at)
       is distinct from (old.session_id, old.tenant_id, old.student_id, old.created_at) then
    raise exception 'Uforanderlige samtalefelt kan ikke endres' using errcode = '23514';
  end if;
  if new.agent_deleted_at is distinct from old.agent_deleted_at then
    if old.agent_deleted_at is not null or new.agent_deleted_at is null or old.agent_id is null
       or (old.state = 'bound' and s.status <> 'completed')
       or (new.state, new.agent_id, new.conversation_id) is distinct from (old.state, old.agent_id, old.conversation_id) then
      raise exception 'Ugyldig opprydding av samtaleagent' using errcode = '23514';
    end if;
    return new;
  end if;
  -- Record-only: creating + no agent -> creating + agent, valid in any session status.
  if old.state = 'creating' and new.state = 'creating'
     and old.agent_id is null and new.agent_id is not null
     and old.conversation_id is null and new.conversation_id is null
     and old.agent_deleted_at is null and new.agent_deleted_at is null then
    return new;
  end if;
  if s.status <> 'active' or old.state = 'bound' or old.agent_deleted_at is not null then
    raise exception 'Samtalebindingen er lukket' using errcode = '23514';
  end if;
  if old.agent_id is not null and new.agent_id is distinct from old.agent_id then
    raise exception 'Agenten kan ikke byttes' using errcode = '23514';
  end if;
  return new;
end
$$;
