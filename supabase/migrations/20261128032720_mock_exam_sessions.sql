begin;
-- Read-time aliases avoid rewriting or relabelling production question rows.
create function public.mock_exam_key(value text) returns text language sql immutable set search_path='' as $$
 select case upper(btrim(value)) when 'WACE' then 'WAEC' when 'WASSCE' then 'WAEC' else upper(btrim(value)) end
$$;
create function public.mock_subject_key(value text) returns text language sql immutable set search_path='' as $$
 select case lower(regexp_replace(btrim(value),'\s+',' ','g'))
 when 'math' then 'mathematics' when 'maths' then 'mathematics' when 'general mathematics' then 'mathematics'
 else lower(regexp_replace(btrim(value),'\s+',' ','g')) end
$$;
create policy draft_question_visibility on public.practice_questions as restrictive for select to authenticated
 using(coalesce(data->>'publicationStatus','approved')='approved' or public.is_admin());
create view public.mock_question_bank with (security_invoker=true) as
 select id,data,public.mock_exam_key(data->>'exam') as exam_key,public.mock_subject_key(data->>'subject') as subject_key
 from public.practice_questions where coalesce(data->>'publicationStatus','approved')='approved';
revoke all on public.mock_question_bank from public,anon;
grant select on public.mock_question_bank to authenticated;
create index mock_bank_exam on public.practice_questions(public.mock_exam_key(data->>'exam'));

create schema mock_private;
revoke all on schema mock_private from public,anon,authenticated;
create table mock_private.attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 exam text not null, subjects jsonb not null, mode text not null check(mode in ('full','revision','draft_review')),
 questions jsonb not null, started_at timestamptz not null default now(), duration_seconds integer not null,
 submitted_at timestamptz, result jsonb
);
alter table mock_private.attempts enable row level security;
revoke all on mock_private.attempts from public,anon,authenticated;
create index mock_attempt_owner on mock_private.attempts(user_id,started_at);

-- Service-only: route verifies Auth, loads the bank under caller RLS, validates
-- options/answers, and passes the server-selected snapshot. No browser RPC grant.
create function public.start_mock_attempt(p_uid uuid,p_exam text,p_subjects jsonb,p_mode text,p_questions jsonb,p_pro boolean,p_request_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt mock_private.attempts%rowtype; profile jsonb; n integer; last_start timestamptz;
begin
 if p_uid is null or p_exam not in ('WAEC','JAMB','NECO') or p_mode not in ('full','revision','draft_review')
 or jsonb_typeof(p_questions) is distinct from 'array' or jsonb_typeof(p_subjects) is distinct from 'array' then
 raise exception 'Invalid mock' using errcode='22023'; end if;
 n:=jsonb_array_length(p_questions);
 if n<1 or n>160 or (p_mode<>'full' and n>8) or jsonb_array_length(p_subjects) not between 1 and 4 then
 raise exception 'Invalid mock size' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_questions) q where
   nullif(q->>'id','') is null or nullif(q->>'question','') is null or
   coalesce(q->>'correctAnswer','') not in ('A','B','C','D') or
   nullif(q#>>'{options,A}','') is null or nullif(q#>>'{options,B}','') is null or
   nullif(q#>>'{options,C}','') is null or nullif(q#>>'{options,D}','') is null)
 or (select count(distinct q->>'id') from jsonb_array_elements(p_questions) q)<>n then
 raise exception 'Invalid question snapshot' using errcode='22023'; end if;
 select data into profile from public.users where id=p_uid::text for update;
 if not found then raise exception 'Profile missing' using errcode='42501'; end if;
 select * into attempt from mock_private.attempts where id=p_request_id and user_id=p_uid;
 if found then
  if attempt.exam<>p_exam or attempt.subjects<>p_subjects or attempt.mode<>p_mode then raise exception 'Request identity changed' using errcode='22023'; end if;
  return jsonb_build_object('id',attempt.id,'startedAt',attempt.started_at,'durationSeconds',attempt.duration_seconds,'questions',attempt.questions);
 end if;
 -- Keep the existing weekly full-mock allowance; revision and draft review never consume it.
 if p_mode='full' and not coalesce(p_pro,false) then
  begin last_start:=(profile->>'lastMockExamDate')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then last_start:=null; end;
  if last_start>now()-interval '7 days' then raise exception 'Weekly mock allowance reached' using errcode='P0001'; end if;
  update public.users set data=data||jsonb_build_object('lastMockExamDate',now()) where id=p_uid::text;
 end if;
 insert into mock_private.attempts(id,user_id,exam,subjects,mode,questions,duration_seconds)
 values(p_request_id,p_uid,p_exam,p_subjects,p_mode,p_questions,n*60) returning * into attempt;
 return jsonb_build_object('id',attempt.id,'startedAt',attempt.started_at,'durationSeconds',attempt.duration_seconds,'questions',attempt.questions);
end $$;

create function public.submit_mock_attempt(p_uid uuid,p_attempt uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt mock_private.attempts%rowtype; n integer; score integer; v_result jsonb; stamp jsonb; new_subjects jsonb;
begin
 select * into attempt from mock_private.attempts where id=p_attempt and user_id=p_uid for update;
 if not found then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 if attempt.result is not null then return attempt.result; end if;
 if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'Invalid answers' using errcode='22023'; end if;
 if exists(select 1 from jsonb_each_text(p_answers) a where a.value not in ('A','B','C','D') or a.value is null
  or not exists(select 1 from jsonb_array_elements(attempt.questions) q where q->>'id'=a.key)) then
 raise exception 'Invalid answers' using errcode='22023'; end if;
 n:=jsonb_array_length(attempt.questions);
 select count(*) into score from jsonb_array_elements(attempt.questions) q where p_answers->>(q->>'id')=q->>'correctAnswer';
 stamp:=jsonb_build_object('__ts',jsonb_build_object('s',floor(extract(epoch from now()))::bigint,'n',0));
 v_result:=jsonb_build_object('attemptId',attempt.id,'userId',p_uid,'source',case when attempt.mode='draft_review' then 'mock_preview' else 'mock_verified' end,
 'mode',attempt.mode,'exam',attempt.exam,'subjects',attempt.subjects,'score',score,'totalQuestions',n,'answers',p_answers,
 'questions',attempt.questions,'createdAt',stamp,'durationSeconds',attempt.duration_seconds,
 'elapsedSeconds',least(attempt.duration_seconds,greatest(0,floor(extract(epoch from now()-attempt.started_at))::integer)));
 -- Profile lock serializes simultaneous results. One result ID makes retries idempotent.
 perform 1 from public.users where id=p_uid::text for update;
 if not found then raise exception 'Profile missing' using errcode='42501'; end if;
 insert into public.quiz_results(id,data) values('mock:'||attempt.id::text,v_result);
 if attempt.mode<>'draft_review' then
  select coalesce(jsonb_agg(distinct s),'[]'::jsonb) into new_subjects from (
   select jsonb_array_elements_text(case when jsonb_typeof(data->'subjectsStudied')='array' then data->'subjectsStudied' else '[]'::jsonb end) as s from public.users where id=p_uid::text
   union select jsonb_array_elements_text(attempt.subjects)
  ) subjects;
  update public.users set data=data||jsonb_build_object(
   'xp',coalesce((data->>'xp')::integer,0)+score*5,'coins',coalesce((data->>'coins')::integer,0)+score*2,
   'totalQuestionsAnswered',coalesce((data->>'totalQuestionsAnswered')::integer,0)+n,
   'totalQuestionsCorrect',coalesce((data->>'totalQuestionsCorrect')::integer,0)+score,
   'subjectsStudied',new_subjects) where id=p_uid::text;
 end if;
 update mock_private.attempts set submitted_at=now(),result=v_result where id=p_attempt;
 return v_result;
end $$;
-- Prevent client document APIs from forging or changing new authoritative mock results.
create function public.guard_verified_mock_result() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and
  (coalesce(new.data->>'source','') in ('mock_verified','mock_preview') or coalesce(old.data->>'source','') in ('mock_verified','mock_preview')) then
 raise exception 'Mock results are server-managed' using errcode='42501'; end if;
 return coalesce(new,old);
end $$;
create trigger verified_mock_guard before insert or update or delete on public.quiz_results for each row execute function public.guard_verified_mock_result();
revoke all on function public.guard_verified_mock_result() from public,anon,authenticated;
revoke all on function public.start_mock_attempt(uuid,text,jsonb,text,jsonb,boolean,uuid),public.submit_mock_attempt(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.start_mock_attempt(uuid,text,jsonb,text,jsonb,boolean,uuid),public.submit_mock_attempt(uuid,uuid,jsonb) to service_role;
commit;
