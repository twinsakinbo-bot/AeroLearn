begin;
-- Trusted keys never enter the legacy document store or revision view.
create table mock_private.assessment_questions(id text primary key, data jsonb not null,
 check(data->>'publicationStatus'='approved'), check(data->>'correctAnswer' in ('A','B','C','D')));
alter table mock_private.assessment_questions enable row level security;
revoke all on mock_private.assessment_questions from public,anon,authenticated;
-- Atomic registry prevents cross-pool races and remembers already exposed content
-- after deletion. It stores identifiers/hashes, never questions or answers.
create table mock_private.content_pools(key text primary key,pool text not null check(pool in ('revision','trusted')));
alter table mock_private.content_pools enable row level security;
revoke all on mock_private.content_pools from public,anon,authenticated;
insert into mock_private.content_pools
 select 'id:'||id,'revision' from public.practice_questions
 union select 'stem:'||encode(sha256(convert_to(lower(regexp_replace(btrim(coalesce(data->>'question',data->>'text','')),'\s+',' ','g')),'UTF8')),'hex'),'revision' from public.practice_questions
 on conflict do nothing;
create function mock_private.separate_question_pools() returns trigger language plpgsql security definer set search_path='' as $$
declare pool_name text:=case when tg_table_schema='mock_private' then 'trusted' else 'revision' end; k text; registered text;
begin
 foreach k in array array['id:'||new.id,'stem:'||encode(sha256(convert_to(lower(regexp_replace(btrim(coalesce(new.data->>'question',new.data->>'text','')),'\s+',' ','g')),'UTF8')),'hex')] loop
  insert into mock_private.content_pools(key,pool) values(k,pool_name)
  on conflict(key) do update set pool=content_pools.pool where content_pools.pool=excluded.pool returning pool into registered;
  if not found then raise exception 'Trusted content overlaps exposed revision content'; end if;
 end loop;
 return new;
end $$;
create trigger separate_pools before insert or update on mock_private.assessment_questions for each row execute function mock_private.separate_question_pools();
create trigger separate_pools before insert or update on public.practice_questions for each row execute function mock_private.separate_question_pools();
revoke all on function mock_private.separate_question_pools() from public,anon,authenticated;
alter table mock_private.attempts drop constraint attempts_mode_check;
alter table mock_private.attempts add check(mode in ('full','revision','draft_review','trusted'));
alter table mock_private.attempts add column checkpoint jsonb not null default '{}', add column checkpoint_at timestamptz,
 add column institution_id uuid references public.institutions(id);
create or replace function public.start_mock_attempt(p_uid uuid,p_exam text,p_subjects jsonb,p_mode text,p_questions jsonb,p_pro boolean,p_request_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt mock_private.attempts%rowtype; profile jsonb; n integer; last_start timestamptz;
begin
 if p_uid is null or p_exam not in ('WAEC','JAMB','NECO') or p_mode not in ('full','revision','draft_review','trusted')
 or jsonb_typeof(p_questions) is distinct from 'array' or jsonb_typeof(p_subjects) is distinct from 'array' then
 raise exception 'Invalid mock' using errcode='22023'; end if;
 n:=jsonb_array_length(p_questions);
 if n<1 or n>160 or (p_mode in ('revision','draft_review') and n>8) or jsonb_array_length(p_subjects) not between 1 and 4 then
 raise exception 'Invalid mock size' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_questions) q where
   nullif(q->>'id','') is null or nullif(q->>'question','') is null or
   coalesce(q->>'correctAnswer','') not in ('A','B','C','D') or
   nullif(q#>>'{options,A}','') is null or nullif(q#>>'{options,B}','') is null or
   nullif(q#>>'{options,C}','') is null or nullif(q#>>'{options,D}','') is null)
 or (select count(distinct q->>'id') from jsonb_array_elements(p_questions) q)<>n then
 raise exception 'Invalid question snapshot' using errcode='22023'; end if;
 if p_mode='trusted' and (select count(*) from public.institution_memberships m join public.institutions i on i.id=m.institution_id where m.user_id=p_uid and m.role='learner' and m.active and i.active)<>1 then raise exception 'One active school context required' using errcode='42501'; end if;
 if p_mode='trusted' and exists(select 1 from jsonb_array_elements(p_questions) q where q->>'exam' is distinct from p_exam or not p_subjects @> jsonb_build_array(q->>'subject')) then raise exception 'Trusted exam/subject mismatch' using errcode='22023'; end if;
 if p_mode='trusted' and exists(select 1 from jsonb_array_elements(p_questions) q
  where not exists(select 1 from mock_private.assessment_questions b where b.id=q->>'id' and b.data=q-'id')) then
  raise exception 'Trusted bank required' using errcode='42501'; end if;
 select data into profile from public.users where id=p_uid::text for update;
 if not found then raise exception 'Profile missing' using errcode='42501'; end if;
 select * into attempt from mock_private.attempts where id=p_request_id and user_id=p_uid;
 if found then
  if attempt.exam<>p_exam or attempt.subjects<>p_subjects or attempt.mode<>p_mode then raise exception 'Request identity changed' using errcode='22023'; end if;
  return jsonb_build_object('deadlineAt',attempt.started_at+attempt.duration_seconds*interval '1 second','assessmentType',case when p_mode='trusted' then 'trusted' else 'formative' end,'id',attempt.id,'startedAt',attempt.started_at,'durationSeconds',attempt.duration_seconds,'questions',attempt.questions);
 end if;
 if p_mode='trusted' and exists(select 1 from mock_private.attempts a cross join lateral jsonb_array_elements(a.questions) oldq
 where a.user_id=p_uid and a.mode='trusted' and exists(select 1 from jsonb_array_elements(p_questions) q where q->>'id'=oldq->>'id' or lower(regexp_replace(btrim(q->>'question'),'\s+',' ','g'))=lower(regexp_replace(btrim(oldq->>'question'),'\s+',' ','g')))) then
 raise exception 'Trusted questions already issued to this learner' using errcode='42501'; end if;
 -- Keep the existing weekly full-mock allowance; revision and draft review never consume it.
 if p_mode='full' and not coalesce(p_pro,false) then
  begin last_start:=(profile->>'lastMockExamDate')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then last_start:=null; end;
  if last_start>now()-interval '7 days' then raise exception 'Weekly mock allowance reached' using errcode='P0001'; end if;
  update public.users set data=data||jsonb_build_object('lastMockExamDate',now()) where id=p_uid::text;
 end if;
 insert into mock_private.attempts(id,user_id,exam,subjects,mode,questions,duration_seconds,started_at)
 values(p_request_id,p_uid,p_exam,p_subjects,p_mode,p_questions,n*60,clock_timestamp()) returning * into attempt;
 if p_mode='trusted' then update mock_private.attempts set institution_id=(select m.institution_id from public.institution_memberships m join public.institutions i on i.id=m.institution_id where m.user_id=p_uid and m.role='learner' and m.active and i.active) where id=attempt.id; end if;
 return jsonb_build_object('deadlineAt',attempt.started_at+attempt.duration_seconds*interval '1 second','assessmentType',case when p_mode='trusted' then 'trusted' else 'formative' end,'id',attempt.id,'startedAt',attempt.started_at,'durationSeconds',attempt.duration_seconds,'questions',attempt.questions);
end $$;

create or replace function public.submit_mock_attempt(p_uid uuid,p_attempt uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt mock_private.attempts%rowtype; n integer; score integer; v_result jsonb; stamp jsonb; new_subjects jsonb; rewarded integer:=0; received timestamptz; deadline timestamptz; timing text; eligible boolean;
begin
 select * into attempt from mock_private.attempts where id=p_attempt and user_id=p_uid for update;
 if not found then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 if attempt.result is not null then return attempt.result; end if;
 if attempt.mode='trusted' then perform 1 from public.institutions where id=attempt.institution_id for update; end if;
 received:=clock_timestamp(); deadline:=attempt.started_at+attempt.duration_seconds*interval '1 second';
 timing:=case when received<=deadline then 'on_time' when received<=deadline+interval '120 seconds' then 'recovered' else 'expired' end;
 eligible:=attempt.mode='trusted' and timing<>'expired' and exists(select 1 from public.institution_memberships m join public.institutions i on i.id=m.institution_id where m.institution_id=attempt.institution_id and m.user_id=p_uid and m.role='learner' and m.active and i.active);
 -- Late trusted recovery can only finalize answers already received before the deadline.
 if attempt.mode in ('full','trusted') and received>deadline then p_answers:=attempt.checkpoint; end if;
 if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'Invalid answers' using errcode='22023'; end if;
 if exists(select 1 from jsonb_each_text(p_answers) a where a.value not in ('A','B','C','D') or a.value is null
  or not exists(select 1 from jsonb_array_elements(attempt.questions) q where q->>'id'=a.key)) then
 raise exception 'Invalid answers' using errcode='22023'; end if;
 n:=jsonb_array_length(attempt.questions);
 select count(*) into score from jsonb_array_elements(attempt.questions) q where p_answers->>(q->>'id')=q->>'correctAnswer';
 stamp:=jsonb_build_object('__ts',jsonb_build_object('s',floor(extract(epoch from now()))::bigint,'n',0));
 v_result:=jsonb_build_object('attemptId',attempt.id,'userId',p_uid,'source',case when attempt.mode='draft_review' then 'mock_preview' else 'mock_verified' end,
 'timing',timing,'reportEligible',eligible,'assessmentType',case when attempt.mode='trusted' then 'trusted' else 'formative' end,'mode',attempt.mode,'exam',attempt.exam,'subjects',attempt.subjects,'score',score,'totalQuestions',n,'answers',p_answers,
 'questions',attempt.questions,'createdAt',stamp,'durationSeconds',attempt.duration_seconds,
 'elapsedSeconds',least(attempt.duration_seconds,greatest(0,floor(extract(epoch from clock_timestamp()-attempt.started_at))::integer)));
 -- Profile lock serializes simultaneous results. One result ID makes retries idempotent.
 perform 1 from public.users where id=p_uid::text for update;
 if not found then raise exception 'Profile missing' using errcode='42501'; end if;
 insert into public.quiz_results(id,data) values('mock:'||attempt.id::text,v_result);
 if attempt.mode<>'draft_review' then
  insert into mock_private.reward_events(user_id,event_key,xp,coins)
   select p_uid,'mock-question:'||(q->>'id'),5,2 from jsonb_array_elements(attempt.questions) q
   where p_answers->>(q->>'id')=q->>'correctAnswer' on conflict do nothing;
  get diagnostics rewarded=row_count;
  select coalesce(jsonb_agg(distinct s),'[]'::jsonb) into new_subjects from (
   select jsonb_array_elements_text(case when jsonb_typeof(data->'subjectsStudied')='array' then data->'subjectsStudied' else '[]'::jsonb end) as s from public.users where id=p_uid::text
   union select jsonb_array_elements_text(attempt.subjects)
  ) subjects;
  update public.users set data=data||jsonb_build_object(
   'xp',coalesce((data->>'xp')::integer,0)+rewarded*5,'coins',coalesce((data->>'coins')::integer,0)+rewarded*2,
   'totalQuestionsAnswered',coalesce((data->>'totalQuestionsAnswered')::integer,0)+n,
   'totalQuestionsCorrect',coalesce((data->>'totalQuestionsCorrect')::integer,0)+score,
   'subjectsStudied',new_subjects) where id=p_uid::text;
 end if;
 update mock_private.attempts set submitted_at=now(),result=v_result where id=p_attempt;
 return v_result;
end $$;

create function public.checkpoint_mock_attempt(p_uid uuid,p_attempt uuid,p_answers jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare a mock_private.attempts%rowtype;
begin
 select * into a from mock_private.attempts where id=p_attempt and user_id=p_uid for update;
 if not found then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 if a.result is not null then return false; end if;
 if a.mode not in ('full','trusted') or clock_timestamp()>a.started_at+a.duration_seconds*interval '1 second' then raise exception 'Deadline passed' using errcode='22023'; end if;
 if jsonb_typeof(p_answers) is distinct from 'object' or exists(select 1 from jsonb_each_text(p_answers) x
 where x.value is null or x.value not in ('A','B','C','D') or not exists(select 1 from jsonb_array_elements(a.questions) q where q->>'id'=x.key)) then raise exception 'Invalid answers' using errcode='22023'; end if;
 update mock_private.attempts set checkpoint=p_answers,checkpoint_at=clock_timestamp() where id=a.id;
 return true;
end $$;
revoke all on function public.checkpoint_mock_attempt(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.checkpoint_mock_attempt(uuid,uuid,jsonb) to service_role;
-- Future institutional reporting must use this private projection, never users aggregates.
create view mock_private.verified_assessment_results as
 select id,user_id,institution_id,submitted_at,result from mock_private.attempts
 where mode='trusted' and result->>'reportEligible'='true' and institution_id is not null;
revoke all on mock_private.verified_assessment_results from public,anon,authenticated;
grant usage on schema mock_private to service_role;
grant select on mock_private.verified_assessment_results to service_role;

create table institutional_private.invite_limits(scope text,bucket timestamptz,hits integer not null,primary key(scope,bucket));
alter table institutional_private.invite_limits enable row level security;
revoke all on institutional_private.invite_limits from public,anon,authenticated;
create function institutional_private.limit_invites() returns trigger language plpgsql security definer set search_path='' as $$
declare hits integer; actor uuid:=auth.uid();
begin
 perform 1 from public.institutions where id=new.institution_id for update;
 if actor is null then raise exception 'Invite actor required' using errcode='42501'; end if;
 insert into institutional_private.invite_limits values('actor:'||actor,(date_trunc('hour',clock_timestamp() at time zone 'UTC') at time zone 'UTC'),1)
 on conflict(scope,bucket) do update set hits=invite_limits.hits+1 returning invite_limits.hits into hits;
 if hits>10 then raise exception 'Invitation hourly limit' using errcode='54000'; end if;
 insert into institutional_private.invite_limits values('school:'||new.institution_id,(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC'),1)
 on conflict(scope,bucket) do update set hits=invite_limits.hits+1 returning invite_limits.hits into hits;
 if hits>50 or (select count(*) from institutional_private.staff_invites where institution_id=new.institution_id and not revoked and accepted_at is null and expires_at>clock_timestamp())>=100 then
 raise exception 'School invitation capacity reached' using errcode='54000'; end if;
 return new;
end $$;
create trigger invitation_capacity before insert on institutional_private.staff_invites for each row execute function institutional_private.limit_invites();
revoke all on function institutional_private.limit_invites() from public,anon,authenticated;

-- Reserve result IDs before submission as well as protecting their source marker.
create or replace function public.guard_verified_mock_result() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and
 (coalesce(new.id,old.id,'') like 'mock:%' or coalesce(new.data->>'source','') in ('mock_verified','mock_preview') or coalesce(old.data->>'source','') in ('mock_verified','mock_preview')) then
 raise exception 'Mock results are server-managed' using errcode='42501'; end if;
 return coalesce(new,old);
end $$;
-- Protect rewards even for authenticated site admins; administrative operations use service role.
create function public.guard_reward_fields() returns trigger language plpgsql set search_path='' as $$
declare field text;
begin
 if current_user not in ('anon','authenticated') then return coalesce(new,old); end if;
 if tg_op='DELETE' then raise exception 'Profile deletion is server-managed' using errcode='42501'; end if;
 foreach field in array array['xp','coins','totalQuestionsAnswered','totalQuestionsCorrect','subjectsStudied','completedLessons','studyStats','streak','longestStreak','lastLoginDate','lastActiveDate','inventory','quests','completedTopics','completedQuizzes','homeworkCompleted','badges','balance','level','xpBoostExpiresAt','lastMockExamDate'] loop
  if tg_op='INSERT' then
   if field='studyStats' and new.data->field='{"questionsAttempted":0,"questionsCorrect":0,"subjectsStudied":[]}'::jsonb then continue; end if;
   if field='quests' and new.data->field='{"xpTier":1,"lessonsTier":1}'::jsonb then continue; end if;
   if field='level' and new.data->field='1'::jsonb then continue; end if;
   if new.data ? field and new.data->field not in ('0','[]','{}','null') then raise exception 'Rewards are server-managed' using errcode='42501'; end if;
  elsif new.data->field is distinct from old.data->field then raise exception 'Rewards are server-managed' using errcode='42501'; end if;
 end loop;
 return new;
end $$;
create trigger reward_fields before insert or update or delete on public.users for each row execute function public.guard_reward_fields();
revoke all on function public.guard_reward_fields() from public,anon,authenticated;
create table mock_private.reward_events(user_id uuid not null references auth.users(id) on delete cascade,event_key text not null,xp integer not null,coins integer not null,created_at timestamptz not null default now(),primary key(user_id,event_key));
alter table mock_private.reward_events enable row level security;
revoke all on mock_private.reward_events from public,anon,authenticated;
create table mock_private.practice_sessions(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,questions jsonb not null,created_at timestamptz not null default now());
alter table mock_private.practice_sessions enable row level security;
revoke all on mock_private.practice_sessions from public,anon,authenticated;
create function public.register_practice_session(p_uid uuid,p_id uuid,p_questions jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) not between 1 and 20 then raise exception 'Invalid session'; end if;
 insert into mock_private.practice_sessions values(p_id,p_uid,p_questions,now());
end $$;
create function public.retail_reward(p_uid uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if correct and (select count(*) from mock_private.reward_events where user_id=p_uid and created_at>=date_trunc('day',now()) and event_key like 'practice:%')<100 then earned_xp:=10;earned_coins:=5; end if;
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
 return jsonb_build_object('xp',earned_xp,'coins',earned_coins);
end $$;
create function public.verified_reward_totals(p_uid uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('xp',coalesce(sum(xp),0),'lessons',count(*) filter(where event_key like 'lesson:%')) from mock_private.reward_events where user_id=p_uid
$$;
revoke all on function public.register_practice_session(uuid,uuid,jsonb),public.retail_reward(uuid,text,jsonb),public.verified_reward_totals(uuid) from public,anon,authenticated;
grant execute on function public.register_practice_session(uuid,uuid,jsonb),public.retail_reward(uuid,text,jsonb),public.verified_reward_totals(uuid) to service_role;
-- Manual service-only retention; no extra hosted infrastructure or automatic production job.
create function public.prune_institutional_audit() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from institutional_private.audit where occurred_at<now()-interval '180 days';
 delete from institutional_private.staff_invites where expires_at<now()-interval '30 days';
 delete from institutional_private.invite_limits where bucket<now()-interval '2 days';
end $$;
revoke all on function public.prune_institutional_audit() from public,anon,authenticated;
grant execute on function public.prune_institutional_audit() to service_role;
commit;
