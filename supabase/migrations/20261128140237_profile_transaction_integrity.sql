begin;
-- One database-owned counter for every document row, covering raw SQL and RPCs.
create function public.own_document_version() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if current_user in ('authenticated','anon') and new.version<>1 then raise exception 'Version is server-managed' using errcode='42501'; end if;
  new.version:=1;
 else
  if current_user in ('authenticated','anon') and new.version is distinct from old.version then raise exception 'Version is server-managed' using errcode='42501'; end if;
  new.version:=old.version+1;
 end if;
 return new;
end $$;
revoke all on function public.own_document_version() from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['users','lessons','practice_questions','conversations','messages','challenges','challenge_results','verification_requests','quiz_results','homework','homework_submissions','notes','reports','settings'] loop
 execute format('create trigger zz_document_version before insert or update on public.%I for each row execute function public.own_document_version()',t);
 end loop;
end $$;
create or replace function public.doc_patch(
  p_table            text,
  p_id               text default null,
  p_parent           text default null,
  p_set              jsonb default '{}'::jsonb,
  p_ops              jsonb default '[]'::jsonb,
  p_replace          boolean default false,
  p_expected_version bigint default null,
  p_require_exists   boolean default false
)
returns table (id text, data jsonb, version bigint)
language plpgsql
as $$
declare
  v_id      text := coalesce(p_id, gen_random_uuid()::text);
  v_found   boolean := false;
  v_version bigint;
  v_data    jsonb := '{}'::jsonb;
  v_path    text[];
  v_arr     jsonb;
  kv        record;
  o         jsonb;
begin
  if not public.doc_table_ok(p_table) then
    raise exception 'Unknown collection %', p_table using errcode = '22023';
  end if;

  execute format('select data, version from public.%I where id = %L for update', p_table, v_id)
    into v_data, v_version;
  v_found := v_version is not null;

  if not v_found then
    if p_expected_version is not null then raise exception 'Document changed under this transaction' using errcode='40001'; end if;
    if p_require_exists then
      raise exception 'No document at %/%', p_table, v_id using errcode = 'P0002';
    end if;
    v_data := '{}'::jsonb;
  elsif p_expected_version is not null and v_version <> p_expected_version then
    raise exception 'Document %/% changed under this transaction', p_table, v_id
      using errcode = '40001';
  elsif p_replace then
    v_data := '{}'::jsonb;
  end if;

  -- Plain fields. jsonb_set with create_missing gives Firestore's semantics for
  -- both "field" and "nested.field".
  for kv in select key, value from jsonb_each(coalesce(p_set, '{}'::jsonb))
  loop
    v_data := jsonb_set(v_data, string_to_array(kv.key, '.'), kv.value, true);
  end loop;

  for o in select * from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb))
  loop
    v_path := string_to_array(o ->> 'f', '.');

    case o ->> 'op'
      when 'delete' then
        v_data := v_data #- v_path;

      when 'serverTimestamp' then
        v_data := jsonb_set(v_data, v_path, jsonb_build_object(
          '__ts', jsonb_build_object(
            's', floor(extract(epoch from clock_timestamp()))::bigint, 'n', 0)
        ), true);

      when 'increment' then
        v_data := jsonb_set(v_data, v_path, to_jsonb(
          coalesce(public.doc_num(v_data #> v_path), 0)
          + coalesce((o #>> '{v}')::numeric, 0)
        ), true);

      when 'arrayUnion' then
        v_arr := coalesce(v_data #> v_path, '[]'::jsonb);
        if jsonb_typeof(v_arr) <> 'array' then v_arr := '[]'::jsonb; end if;
        v_arr := v_arr || (
          select coalesce(jsonb_agg(t.el), '[]'::jsonb)
          from jsonb_array_elements(coalesce(o -> 'v', '[]'::jsonb)) as t(el)
          where not (v_arr @> jsonb_build_array(t.el))
        );
        v_data := jsonb_set(v_data, v_path, v_arr, true);

      when 'arrayRemove' then
        v_arr := coalesce(v_data #> v_path, '[]'::jsonb);
        if jsonb_typeof(v_arr) <> 'array' then v_arr := '[]'::jsonb; end if;
        v_arr := (
          select coalesce(jsonb_agg(t.el), '[]'::jsonb)
          from jsonb_array_elements(v_arr) as t(el)
          where not (coalesce(o -> 'v', '[]'::jsonb) @> jsonb_build_array(t.el))
        );
        v_data := jsonb_set(v_data, v_path, v_arr, true);

      else
        raise exception 'Unknown field operation %', o ->> 'op' using errcode = '22023';
    end case;
  end loop;

  if v_found then
    return query execute format(
      'update public.%I set data = %L::jsonb
         where id = %L returning id, data, version',
      p_table, v_data::text, v_id
    );
  else
    return query execute format(
      'insert into public.%I (id, parent_id, data) values (%L, %L, %L::jsonb)
         returning id, data, version',
      p_table, v_id, p_parent, v_data::text
    );
  end if;
end
$$;

create or replace function public.redeem_licence_code(
  p_key text,   -- normalised (upper-case, no dashes) code text
  p_uid text
)
returns table (
  status        text,
  plan_id       text,
  expires_at    timestamptz,
  extended_from timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      text;
  v_row     public.licence_codes%rowtype;
  v_current timestamptz;
  v_days    int;
  v_new_exp timestamptz;
  v_email   text;
begin
  -- Defence in depth: the route verifies the id token, but this function is
  -- granted to `authenticated`, so it must not take the caller's word for who
  -- they are. A definer function that trusts p_uid is a way to gift someone else
  -- a redemption.
  if auth.uid() is null or auth.uid()::text <> p_uid then
    raise exception 'redeem_licence_code must be called by the signed-in user'
      using errcode = '42501';
  end if;

  if p_key is null or char_length(p_key) <> 14 then
    return query select 'malformed'::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- Tell guard_user_fields() this write is authorised. `is_local => true` scopes
  -- it to the current transaction, and a client has no channel to set
  -- `aerolearn.*` — PostgREST does not expose arbitrary GUCs, and even if one
  -- leaked in it would be reset at commit.
  perform set_config('aerolearn.redeeming', '1', true);

  perform 1 from public.users where id=p_uid for update;
  if not found then raise exception 'Profile missing' using errcode='42501'; end if;
  v_id := encode(sha256(convert_to(upper(p_key), 'UTF8')), 'hex');

  -- Atomic claim: the winner gets the row, everyone else gets zero rows. There is
  -- no read-then-write window for a concurrent redemption to slip through.
  update public.licence_codes as lc
     set status      = 'used',
         redeemed_by = p_uid,
         redeemed_at = now(),
         updated_at  = now()
   where lc.id = v_id
     and lc.status = 'available'
   returning lc.* into v_row;

  if v_row.id is null then
    -- Distinguish the cases so the UI can be honest about which one happened.
    -- Telling a student "already redeemed" is a deliberate trade: it costs an
    -- attacker nothing (a used code is worthless to them, and the alphabet makes
    -- an unused one unguessable), but it is exactly what a student who was sold a
    -- recycled code needs in order to prove it.
    select * into v_row from public.licence_codes where id = v_id;
    if v_row.id is null then
      return query select 'not_found'::text, null::text, null::timestamptz, null::timestamptz;
    elsif v_row.status = 'cancelled' then
      return query select 'cancelled'::text, v_row.plan_id, null::timestamptz, v_row.expires_granted;
    else
      return query select 'used'::text, v_row.plan_id, v_row.expires_granted, null::timestamptz;
    end if;
    return;
  end if;

  -- Grant the access, extending rather than shortening. A student who redeems a
  -- second term with 20 days left gets those 20 days plus a new term; the same
  -- rule the manual queue follows, so the two paths cannot disagree.
  select to_timestamp((u.data -> 'proExpiresAt' -> '__ts' ->> 's')::bigint)
    into v_current
  from public.users u
  where u.id = p_uid
    and jsonb_typeof(u.data -> 'proExpiresAt') = 'object';

  select days into v_days from public.plan_durations where plan = v_row.plan_id;

  if v_days is null then
    -- Unknown plan id: a code was minted for something no longer priced. Grant a
  -- month rather than taking access away — the student is not at fault.
    v_days := 30;
  end if;

  if exists(select 1 from public.plan_durations d join public.users u on d.plan=u.data->>'subscription' where u.id=p_uid and d.days<0) then
    select data->>'subscription' into v_row.plan_id from public.users where id=p_uid;
    v_new_exp:=null;
  elsif v_days < 0 then
    v_new_exp := null;                 -- lifetime: isProUser reads null as permanent
  else
    v_new_exp := greatest(coalesce(v_current, now()), now())
                 + make_interval(days => v_days);
  end if;

  select data ->> 'email' into v_email from public.users where id = p_uid;

  update public.users
     set data = jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      data,
                      '{subscription}',
                      to_jsonb(v_row.plan_id)
                    ),
                    '{proExpiresAt}',
                    case
                      when v_new_exp is null then 'null'::jsonb
                      else jsonb_build_object('__ts', jsonb_build_object(
                        's', floor(extract(epoch from v_new_exp))::bigint, 'n', 0))
                    end
                  ),
                  '{licenceRedeemedAt}',
                  jsonb_build_object('__ts', jsonb_build_object(
                    's', floor(extract(epoch from now()))::bigint, 'n', 0))
                )
   where id = p_uid;

  -- Audit trail: what this code granted, to whom.
  update public.licence_codes
     set expires_granted = v_new_exp,
         redeemed_email  = v_email
   where id = v_row.id;

  return query select 'ok'::text, v_row.plan_id, v_new_exp, v_current;
end
$$;


create function public.claim_login_reward(p_uid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; today date:=(clock_timestamp() at time zone 'Africa/Lagos')::date; last_day date; gap integer;
 streak integer; best integer; coins integer; inv jsonb; used_freeze boolean:=false;
begin
 select data into p from public.users where id=p_uid::text for update;
 if not found then raise exception 'Profile missing' using errcode='42501';end if;
 select max(value::date) into last_day from jsonb_each_text(p) where key in ('lastActiveDate','lastLoginDate') and value ~ '^\d{4}-\d{2}-\d{2}$';
 gap:=today-last_day; streak:=greatest(coalesce((p->>'streak')::integer,0),0);best:=coalesce((p->>'longestStreak')::integer,streak);coins:=coalesce((p->>'coins')::integer,0);
 select coalesce(jsonb_agg(x),'[]') into inv from jsonb_array_elements(case when jsonb_typeof(p->'inventory')='array' then p->'inventory' else '[]' end)x where jsonb_typeof(x)='string';
 if gap is not null and gap<=0 then return jsonb_build_object('updated',false,'streak',streak,'longestStreak',best,'coins',coins,'inventory',inv,'lastActiveDate',last_day,'lastLoginDate',today);end if;
 if gap=1 and streak>0 then streak:=streak+1;
 elsif gap=2 and streak>0 and inv ? 'streak_freeze' then
  streak:=streak+1;used_freeze:=true;
  select coalesce(jsonb_agg(value order by ord),'[]') into inv from jsonb_array_elements(inv) with ordinality x(value,ord)
  where ord<>(select min(ord) from jsonb_array_elements(inv) with ordinality y(value,ord) where value='"streak_freeze"');
 else streak:=1;end if;
 insert into mock_private.reward_events(user_id,event_key,xp,coins) values(p_uid,'login:'||today,0,10) on conflict do nothing;
 if not found then return jsonb_build_object('updated',false,'streak',streak,'longestStreak',best,'coins',coins,'inventory',p->'inventory');end if;
 coins:=coins+10;best:=greatest(best,streak);
 update public.users set data=data||jsonb_build_object('lastActiveDate',today,'lastLoginDate',today,'streak',streak,'longestStreak',best,'coins',coins,'inventory',inv) where id=p_uid::text;
 return jsonb_build_object('updated',true,'streak',streak,'longestStreak',best,'coins',coins,'inventory',inv,'lastActiveDate',today,'lastLoginDate',today,'usedFreeze',used_freeze);
end $$;
create function public.claim_quest_reward(p_uid uuid,p_type text,p_tier integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; quests jsonb; field text; tier integer; verified jsonb; amount integer; event text;
begin
 if p_type not in ('xp','lessons') or p_type is null then raise exception 'Invalid quest' using errcode='22023';end if;
 select data into p from public.users where id=p_uid::text for update;
 if not found then raise exception 'Profile missing' using errcode='42501';end if;
 quests:=case when jsonb_typeof(p->'quests')='object' then p->'quests' else '{"xpTier":1,"lessonsTier":1}'::jsonb end;field:=case when p_type='xp' then 'xpTier' else 'lessonsTier' end;
 tier:=greatest(coalesce((quests->>field)::integer,1),1);p_tier:=coalesce(p_tier,tier);
 if p_tier<1 or p_tier>100000 then raise exception 'Invalid tier' using errcode='22023';end if;
 event:='quest:'||p_type||':'||p_tier;
 if p_tier<tier and exists(select 1 from mock_private.reward_events where user_id=p_uid and event_key=event) then
 return jsonb_build_object('success',true,'duplicate',true,'quests',quests,'coins',p->'coins','reward',0);end if;
 if p_tier<>tier then raise exception 'Quest tier changed' using errcode='40001';end if;
 verified:=public.verified_reward_totals(p_uid);
 if (p_type='xp' and (verified->>'xp')::bigint<tier::bigint*50) or (p_type='lessons' and (verified->>'lessons')::bigint<tier::bigint*5) then raise exception 'Quest target not met' using errcode='22023';end if;
 amount:=tier*case when p_type='xp' then 20 else 30 end;
 insert into mock_private.reward_events(user_id,event_key,xp,coins) values(p_uid,event,0,amount) on conflict do nothing;
 if not found then raise exception 'Quest state inconsistent' using errcode='40001';end if;
 quests:=quests||jsonb_build_object(field,tier+1);
 update public.users set data=data||jsonb_build_object('quests',quests,'coins',coalesce((p->>'coins')::integer,0)+amount) where id=p_uid::text;
 return jsonb_build_object('success',true,'quests',quests,'coins',coalesce((p->>'coins')::integer,0)+amount,'reward',amount);
end $$;
revoke all on function public.claim_login_reward(uuid),public.claim_quest_reward(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_login_reward(uuid),public.claim_quest_reward(uuid,text,integer) to service_role;

create function mock_private.reward_day_start(p_at timestamptz) returns timestamptz language sql immutable set search_path='' as $$
 select date_trunc('day',p_at at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'
$$;
revoke all on function mock_private.reward_day_start(timestamptz) from public,anon,authenticated;

create table mock_private.practice_answers(session_id uuid references mock_private.practice_sessions(id) on delete cascade,question_id text,correct boolean not null,primary key(session_id,question_id));
alter table mock_private.practice_answers enable row level security;
revoke all on mock_private.practice_answers from public,anon,authenticated;
create or replace function public.retail_reward(p_uid uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare profile jsonb; q jsonb; item jsonb; event text; earned_xp integer:=0; earned_coins integer:=0; subject text; price integer; correct boolean:=false;
begin
 select data into profile from public.users where id=p_uid::text for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 if p_action='practice' then
  select question into q from mock_private.practice_sessions s cross join lateral jsonb_array_elements(s.questions) question
  where s.id=(p_payload->>'session')::uuid and s.user_id=p_uid and s.created_at>now()-interval '1 day' and question->>'id'=p_payload->>'question';
  if q is null or coalesce(p_payload->>'answer','') not in ('A','B','C','D') then raise exception 'Invalid practice answer'; end if;
  event:='practice:'||(p_payload->>'session')||':'||(q->>'id'); subject:=q->>'subject';
  correct:=q->>'correctAnswer'=p_payload->>'answer';
  if correct and (select count(*) from mock_private.reward_events where user_id=p_uid and created_at>=mock_private.reward_day_start(clock_timestamp()) and event_key like 'practice:%')<100 then earned_xp:=10;earned_coins:=5; end if;
 elsif p_action='lesson' then
  select data into q from public.lessons where id=p_payload->>'lesson' and coalesce(data->>'status','published')='published';
  if q is null then raise exception 'Lesson unavailable'; end if;
  event:='lesson:'||(p_payload->>'lesson'); subject:=q->>'subject';earned_xp:=10;earned_coins:=5;
 elsif p_action='purchase' then
  -- Fixed catalogue; callers cannot set a price.
  item:='{"streak_freeze":200,"gold_frame":500,"sapphire_frame":450,"emerald_frame":450,"title_math_genius":300,"title_jamb_scholar":400,"title_speed_demon":300,"title_science_explorer":350,"title_chemistry_whiz":350,"title_problem_solver":350}';
  price:=(item->>(p_payload->>'item'))::integer;
  if price is null then raise exception 'Unknown item'; end if;
  if coalesce(profile->'inventory','[]') ? (p_payload->>'item') then return jsonb_build_object('balance',coalesce((profile->>'coins')::integer,0)); end if;
  if coalesce((profile->>'coins')::integer,0)<price then raise exception 'Insufficient coins'; end if;
  update public.users set data=data||jsonb_build_object('coins',(profile->>'coins')::integer-price,'inventory',coalesce(profile->'inventory','[]')||jsonb_build_array(p_payload->>'item')) where id=p_uid::text;
  return jsonb_build_object('balance',(profile->>'coins')::integer-price);
 else raise exception 'Unknown reward operation'; end if;
 insert into mock_private.reward_events(user_id,event_key,xp,coins) values(p_uid,event,earned_xp,earned_coins) on conflict do nothing;
 if not found then return jsonb_build_object('duplicate',true); end if;
 update public.users set data=data||jsonb_build_object('xp',coalesce((profile->>'xp')::integer,0)+earned_xp,'coins',coalesce((profile->>'coins')::integer,0)+earned_coins,
 'subjectsStudied',(select coalesce(jsonb_agg(distinct x),'[]') from jsonb_array_elements(coalesce(profile->'subjectsStudied','[]')||jsonb_build_array(subject)) x)) ||
 case when p_action='lesson' then jsonb_build_object('completedLessons',coalesce(profile->'completedLessons','[]')||jsonb_build_array(p_payload->>'lesson')) else jsonb_build_object('totalQuestionsAnswered',coalesce((profile->>'totalQuestionsAnswered')::integer,0)+1,'totalQuestionsCorrect',coalesce((profile->>'totalQuestionsCorrect')::integer,0)+case when correct then 1 else 0 end) end where id=p_uid::text;
 if p_action='practice' then
  insert into mock_private.practice_answers values((p_payload->>'session')::uuid,q->>'id',correct);
  if (select count(*) from mock_private.practice_answers where session_id=(p_payload->>'session')::uuid)=(select jsonb_array_length(questions) from mock_private.practice_sessions where id=(p_payload->>'session')::uuid) then
   insert into public.quiz_results(id,data) select 'practice:'||s.id,jsonb_build_object('source','practice_verified','userId',p_uid,'subject',q->>'subject','score',(select count(*) from mock_private.practice_answers where session_id=s.id and practice_answers.correct),'totalQuestions',jsonb_array_length(s.questions),'createdAt',jsonb_build_object('__ts',jsonb_build_object('s',floor(extract(epoch from clock_timestamp()))::bigint,'n',0))) from mock_private.practice_sessions s where s.id=(p_payload->>'session')::uuid;
  end if;
 end if;
 return jsonb_build_object('xp',earned_xp,'coins',earned_coins);
end $$;

create or replace function public.guard_verified_mock_result() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and
 (coalesce(new.id,old.id,'') like 'mock:%' or coalesce(new.id,old.id,'') like 'practice:%' or coalesce(new.data->>'source','') in ('mock_verified','mock_preview','practice_verified') or coalesce(old.data->>'source','') in ('mock_verified','mock_preview','practice_verified')) then
 raise exception 'Verified results are server-managed' using errcode='42501';end if;
 return coalesce(new,old);
end $$;
create function public.verified_quiz_counts(p_uid uuid) returns jsonb language sql security definer set search_path='' as $$
 with verified as (
  select 'mock:'||id::text id,(result->>'score')::integer score,(result->>'totalQuestions')::integer total from mock_private.attempts where user_id=p_uid and result is not null and mode<>'draft_review'
  union all
  select 'practice:'||s.id::text,count(*) filter(where a.correct)::integer,jsonb_array_length(s.questions) from mock_private.practice_sessions s join mock_private.practice_answers a on a.session_id=s.id where s.user_id=p_uid group by s.id having count(*)=jsonb_array_length(s.questions)
 ) select jsonb_build_object('historyIds',(select coalesce(jsonb_agg(x.id),'[]') from (select 'mock:'||id::text id from mock_private.attempts where user_id=p_uid and result is not null order by submitted_at desc limit 10)x),'quizzes',(select count(*) from verified),'perfect',(select count(*) from verified where score=total and total>0),'legacy',(select count(*) from public.quiz_results r where r.data->>'userId'=p_uid::text and coalesce(r.data->>'source','')<>'mock_preview' and not exists(select 1 from verified v where v.id=r.id)))
$$;
revoke all on function public.verified_quiz_counts(uuid) from public,anon,authenticated;
grant execute on function public.verified_quiz_counts(uuid) to service_role;

commit;
