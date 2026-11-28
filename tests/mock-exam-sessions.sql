\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values('d0000000-0000-4000-8000-000000000001','mock-a@example.invalid'),('d0000000-0000-4000-8000-000000000002','mock-b@example.invalid');
insert into public.practice_questions(id,data) values
 ('mock-alias','{"exam":" wace ","subject":" maths ","question":"Synthetic alias"}'),
 ('mock-draft','{"exam":"WAEC","subject":"Mathematics","publicationStatus":"draft","question":"Never public"}');
create function pg_temp.denied(q text) returns void language plpgsql as $$ begin
 begin execute q; exception when insufficient_privilege then return; end;
 raise exception 'Unexpected client authorization'; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000001',true);
do $$ begin
 assert (select count(*) from public.practice_questions where id='mock-draft')=0,'Direct draft read allowed';
 assert (select count(*) from public.mock_question_bank where exam_key='WAEC' and subject_key='mathematics')=1,'Alias or draft exclusion failed';
end $$;
select pg_temp.denied('select * from mock_private.attempts');
select pg_temp.denied($q$select public.start_mock_attempt('d0000000-0000-4000-8000-000000000001','WAEC','["Mathematics"]','revision','[]',false)$q$);
select pg_temp.denied($q$insert into public.quiz_results(id,data) values('forged-mock','{"source":"mock_verified","userId":"d0000000-0000-4000-8000-000000000001"}')$q$);
reset role;
set local role service_role;
do $$
declare snapshot jsonb := '[{"id":"synthetic-q1","question":"2 + 3?","options":{"A":"3","B":"4","C":"5","D":"6"},"correctAnswer":"C","explanation":"2 + 3 = 5"},{"id":"synthetic-q2","question":"3 + 4?","options":{"A":"3","B":"4","C":"5","D":"7"},"correctAnswer":"D","explanation":"3 + 4 = 7"}]';
 a uuid:='d0000000-0000-4000-8000-000000000001'; b uuid:='d0000000-0000-4000-8000-000000000002'; attempt uuid; result jsonb; start jsonb;
begin
 start:=public.start_mock_attempt(a,'WAEC','["Mathematics"]','revision',snapshot,false);
 attempt:=(start->>'id')::uuid;
 assert (start->>'durationSeconds')::integer=120,'Timer must equal actual count';
 perform pg_temp.denied(format('select public.submit_mock_attempt(%L,%L,%L)',b,attempt,'{}'));
 begin perform public.submit_mock_attempt(a,attempt,'{"foreign-id":"A"}');raise exception 'Foreign question accepted'; exception when invalid_parameter_value then null;end;
 result:=public.submit_mock_attempt(a,attempt,'{"synthetic-q1":"C"}');
 assert (result->>'score')::integer=1 and (result->>'totalQuestions')::integer=2,'Blank answers must score zero';
 assert result=public.submit_mock_attempt(a,attempt,'{"synthetic-q1":"A","synthetic-q2":"D"}'),'Retry changed saved result';
 assert result#>>'{questions,0,explanation}'='2 + 3 = 5','Worked review lost';
 -- Full-mock allowance serializes and is independent of revision.
 start:=public.start_mock_attempt(a,'WAEC','["Mathematics"]','full',snapshot,false);
 begin perform public.start_mock_attempt(a,'WAEC','["Mathematics"]','full',snapshot,false);raise exception 'Weekly limit bypassed' using errcode='22023';exception when raise_exception then null;end;
 start:=public.start_mock_attempt(a,'WAEC','["Mathematics"]','draft_review',snapshot,false);
 perform public.submit_mock_attempt(a,(start->>'id')::uuid,'{"synthetic-q1":"C","synthetic-q2":"D"}');
end $$;
reset role;
do $$ begin
 assert (select (data->>'xp')::integer from public.users where id='d0000000-0000-4000-8000-000000000001')=5,'Reward duplicate or draft reward';
 assert (select (data->>'totalQuestionsAnswered')::integer from public.users where id='d0000000-0000-4000-8000-000000000001')=2,'Progress missing/duplicated';
 assert (select count(*) from public.quiz_results where data->>'source'='mock_verified')=1,'Duplicate result';
 assert not has_function_privilege('anon','public.submit_mock_attempt(uuid,uuid,jsonb)','execute'),'Anon submit grant';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000002',true);
do $$ begin assert (select count(*) from public.quiz_results where data->>'source'='mock_verified')=0,'Foreign result readable';end $$;
select set_config('request.jwt.claim.sub','d0000000-0000-4000-8000-000000000001',true);
do $$ begin assert (select count(*) from public.quiz_results where data->>'source'='mock_verified')=1,'Own result unavailable';end $$;
select pg_temp.denied($q$update public.quiz_results set data=data||'{"score":100}' where data->>'source'='mock_verified'$q$);
select pg_temp.denied($q$delete from public.quiz_results where data->>'source'='mock_verified'$q$);
rollback;
\echo 'Mock sessions: snapshot, scoring, blanks, idempotency, atomic progress, weekly allowance, draft exclusion and result RLS passed.'
