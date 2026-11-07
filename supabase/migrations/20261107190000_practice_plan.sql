-- The learner selects practice goals, not new curriculum. Preserve the complete published snapshot.
begin;
alter table public.practice_sessions add column plan jsonb;
alter table public.practice_sessions disable trigger sessions_guard;
update public.practice_sessions s set plan = jsonb_build_object(
  'goalIds', (select jsonb_agg(g ->> 'id' order by n) from jsonb_array_elements(s.pack -> 'goals') with ordinality as goals(g, n)),
  'focus', 'explain', 'request', ''
);
alter table public.practice_sessions enable trigger sessions_guard;
alter table public.practice_sessions alter column plan set not null;
alter table public.practice_sessions add constraint sessions_plan_shape check (
  jsonb_typeof(plan) = 'object'
  and plan ?& array['goalIds', 'focus', 'request']
  and jsonb_typeof(plan -> 'goalIds') = 'array'
  and jsonb_array_length(plan -> 'goalIds') between 1 and 3
  and jsonb_typeof(plan -> 'focus') = 'string'
  and plan ->> 'focus' in ('understand', 'explain', 'examples', 'discussion')
  and jsonb_typeof(plan -> 'request') = 'string'
  and char_length(plan ->> 'request') <= 600
);

create or replace function public.sessions_guard() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare
  p public.packs;
  ev jsonb;
  i int;
  planned jsonb;
begin
  if tg_op = 'INSERT' then
    select * into p from public.packs where id = new.pack_id;
    if not found or p.status <> 'published' or p.tenant_id <> new.tenant_id or p.version <> new.pack_version
       or new.pack ->> 'id' is distinct from p.id::text
       or new.pack -> 'goals' is distinct from p.goals
       or new.pack -> 'sources' is distinct from p.sources then
      raise exception 'Økten må starte fra en publisert fagpakke' using errcode = '23514';
    end if;
    select jsonb_agg(g ->> 'id' order by n) into planned
      from jsonb_array_elements(p.goals) with ordinality as goals(g, n)
      where new.plan -> 'goalIds' @> jsonb_build_array(g ->> 'id');
    if planned is null or planned is distinct from new.plan -> 'goalIds' then
      raise exception 'Øvingsmålene må være unike mål i fagpakkens rekkefølge' using errcode = '23514';
    end if;
    if new.status <> 'active' or new.revision <> 0 or jsonb_array_length(new.evidence) <> 0 or jsonb_array_length(new.turns) > 1 then
      raise exception 'Ugyldig starttilstand for økt' using errcode = '23514';
    end if;
    if new.active_goal_id is distinct from (new.plan -> 'goalIds' ->> 0) then
      raise exception 'Økten må starte på første valgte mål' using errcode = '23514';
    end if;
  else
    if old.status = 'completed' then
      raise exception 'Avsluttede økter kan ikke endres' using errcode = '23514';
    end if;
    if (new.id, new.tenant_id, new.student_id, new.pack_id, new.pack_version, new.mode, new.started_at)
         is distinct from (old.id, old.tenant_id, old.student_id, old.pack_id, old.pack_version, old.mode, old.started_at)
       or new.pack is distinct from old.pack or new.plan is distinct from old.plan then
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

  if not (new.plan -> 'goalIds' @> jsonb_build_array(new.active_goal_id)) then
    raise exception 'Ukjent aktivt øvingsmål' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.turns) t
    where coalesce(t ->> 'role', '') not in ('user', 'assistant')
       or coalesce(char_length(t ->> 'text'), 0) not between 1 and 2000
       or not (new.plan -> 'goalIds' @> jsonb_build_array(t ->> 'goalId'))
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
  end loop;
  return new;
end
$$;
commit;
