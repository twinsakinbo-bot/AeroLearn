\set ON_ERROR_STOP on
begin;
create function pg_temp.denied(q text, code text default '42501') returns void language plpgsql as $$ begin
 begin execute q;exception when others then if sqlstate=code then return;else raise;end if;end;
 raise exception 'Unexpected access: %',q;end $$;
insert into auth.users(id,email,email_confirmed_at) select ('f0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'security-'||n||'@example.invalid',now() from generate_series(1,4)n;
insert into public.practice_questions(id,data) values('formative-open','{"exam":"WAEC","subject":"Economics","question":"Public revision test","options":{"A":"1","B":"2","C":"3","D":"4"},"correctAnswer":"A","explanation":"Public worked revision"}');
insert into mock_private.assessment_questions(id,data) values('private-key','{"exam":"WAEC","subject":"Economics","publicationStatus":"approved","question":"Private assessment test","options":{"A":"1","B":"2","C":"3","D":"4"},"correctAnswer":"B","explanation":"Private worked review"}');
insert into institutional_private.operators values('f0000000-0000-4000-8000-000000000001',true);
update institutional_private.controls set enabled=true;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
create temp table hardening_school as select (public.institutional_command('create_institution',null,'{"name":"Synthetic hardening"}')->>'institution_id')::uuid org;
select public.institutional_command('enroll_learner',org,'{"user_id":"f0000000-0000-4000-8000-000000000002","alias":"SEC-002"}') from hardening_school;
-- Direct RPC invitation limits apply inside the transaction; rejected work rolls back counters.
do $$ declare i integer; org uuid:=(select org from hardening_school);begin
 for i in 1..10 loop perform public.institutional_command('invite_staff',org,jsonb_build_object('email','invite'||i||'@example.invalid','role','teacher'));end loop;
 perform set_config('TimeZone','Pacific/Chatham',true);
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','invite_staff',org,'{"email":"over@example.invalid","role":"teacher"}'),'54000');
 perform set_config('TimeZone','UTC',true);
end $$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
do $$ declare field text;begin
 -- Evidence: revision answers ARE intentionally public, including generic RPC reads.
 assert (select data->>'correctAnswer' from public.practice_questions where id='formative-open')='A';
 assert (select data->>'explanation' from public.mock_question_bank where id='formative-open')='Public worked revision';
 assert exists(select 1 from public.doc_query('practice_questions',null,'[]','[]',100,null,false) where data->>'correctAnswer'='A');
 foreach field in array array['xp','coins','totalQuestionsAnswered','totalQuestionsCorrect','subjectsStudied','completedLessons','studyStats','streak','longestStreak','lastLoginDate','lastActiveDate','inventory','quests','completedTopics','completedQuizzes','homeworkCompleted','badges','balance','level','xpBoostExpiresAt','lastMockExamDate'] loop
 perform pg_temp.denied(format('update public.users set data=data||jsonb_build_object(%L,999) where id=%L',field,'f0000000-0000-4000-8000-000000000002'));
 end loop;
end $$;
select pg_temp.denied($q$insert into public.quiz_results(id,data) values('mock:reserved','{"source":"practice","userId":"f0000000-0000-4000-8000-000000000002"}')$q$);
select pg_temp.denied('select * from mock_private.assessment_questions');
select pg_temp.denied('select * from mock_private.reward_events');
select pg_temp.denied('select * from mock_private.practice_sessions');
select pg_temp.denied('select public.prune_institutional_audit()');
select pg_temp.denied($q$select public.verified_reward_totals('f0000000-0000-4000-8000-000000000002')$q$);
select pg_temp.denied($q$select public.register_practice_session('f0000000-0000-4000-8000-000000000002',gen_random_uuid(),'[]')$q$);
select pg_temp.denied($q$select * from public.doc_query('assessment_questions',null,'[]','[]',100,null,false)$q$,'22023');
select pg_temp.denied($q$select * from public.doc_patch('users','f0000000-0000-4000-8000-000000000002',null,'{"coins":999}','[]',false,null,true)$q$);
delete from public.users where id='f0000000-0000-4000-8000-000000000002';
do $$ begin assert exists(select 1 from public.users where id='f0000000-0000-4000-8000-000000000002'),'Profile deleted';end $$;
select pg_temp.denied($q$select public.retail_reward('f0000000-0000-4000-8000-000000000002','lesson','{}')$q$);
select pg_temp.denied($q$select public.checkpoint_mock_attempt('f0000000-0000-4000-8000-000000000002',gen_random_uuid(),'{}')$q$);
reset role;
-- Legacy missing-profile fallback accepts only empty progress defaults.
delete from public.users where id='f0000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000004',true);
insert into public.users(id,data) values('f0000000-0000-4000-8000-000000000004','{"role":"student","subscription":"free","xp":0,"coins":0,"studyStats":{"questionsAttempted":0,"questionsCorrect":0,"subjectsStudied":[]},"inventory":[],"completedLessons":[]}');
reset role;
-- Per-school daily quota independent of actor and outstanding cap.
update institutional_private.invite_limits set hits=0 where scope like 'actor:%';
update institutional_private.invite_limits set hits=50 where scope like 'school:%';
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
select pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','invite_staff',(select org from hardening_school),'{"email":"cap@example.invalid","role":"teacher"}'),'54000');
reset role;
update institutional_private.invite_limits set hits=0;
-- Seed 100 live invites as maintenance to isolate capacity test from hourly limits.
alter table institutional_private.staff_invites disable trigger invitation_capacity;
insert into institutional_private.staff_invites(institution_id,email_hash,token_hash,role,expires_at) select org,'synthetic-hash','capacity-'||n,'teacher',now()+interval '1 day' from hardening_school cross join generate_series(1,90)n;
alter table institutional_private.staff_invites enable trigger invitation_capacity;
set local role authenticated;
select pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','invite_staff',(select org from hardening_school),'{"email":"pending@example.invalid","role":"teacher"}'),'54000');
reset role;
-- Deadline, checkpoint freeze, grace recovery, expiry and idempotency.
do $$ declare uid uuid:='f0000000-0000-4000-8000-000000000002'; snapshot jsonb; a jsonb; b jsonb; v_attempt uuid; r jsonb; begin
 select jsonb_build_array(data||jsonb_build_object('id',assessment_questions.id)) into snapshot from mock_private.assessment_questions where assessment_questions.id='private-key';
 a:=public.start_mock_attempt(uid,'WAEC','["Economics"]','trusted',snapshot,true);v_attempt:=(a->>'id')::uuid;
 assert public.checkpoint_mock_attempt(uid,v_attempt,'{"private-key":"B"}');
 update mock_private.attempts set started_at=clock_timestamp()-interval '70 seconds' where attempts.id=v_attempt;
 perform pg_temp.denied(format('select public.checkpoint_mock_attempt(%L,%L,%L)',uid,v_attempt,'{"private-key":"A"}'),'22023');
 r:=public.submit_mock_attempt(uid,v_attempt,'{"private-key":"A"}');
 assert r->>'timing'='recovered' and r->>'score'='1' and (r->>'reportEligible')::boolean;
 assert public.submit_mock_attempt(uid,v_attempt,'{}')=r,'Retry changed a persisted result';
 assert public.start_mock_attempt(uid,'WAEC','["Economics"]','trusted',snapshot,true,v_attempt)->>'id'=v_attempt::text,'Start retry identity changed';
 assert exists(select 1 from mock_private.verified_assessment_results where verified_assessment_results.id=v_attempt);
 insert into mock_private.assessment_questions(id,data) select 'same-stem-new-id',data from mock_private.assessment_questions where assessment_questions.id='private-key';
 perform pg_temp.denied(format('select public.start_mock_attempt(%L,%L,%L,%L,%L,true)',uid,'WAEC','["Economics"]','trusted',(select jsonb_build_array(data||jsonb_build_object('id',assessment_questions.id)) from mock_private.assessment_questions where assessment_questions.id='same-stem-new-id')),'42501');
 perform pg_temp.denied(format('select public.start_mock_attempt(%L,%L,%L,%L,%L,true)',uid,'WAEC','["Economics"]','trusted',snapshot),'42501');
 insert into mock_private.assessment_questions(id,data) select 'private-key-2',data||'{"question":"Fresh private assessment test"}' from mock_private.assessment_questions where assessment_questions.id='private-key';
 select jsonb_build_array(data||jsonb_build_object('id',assessment_questions.id)) into snapshot from mock_private.assessment_questions where assessment_questions.id='private-key-2';
 a:=public.start_mock_attempt(uid,'WAEC','["Economics"]','trusted',snapshot,true);v_attempt:=(a->>'id')::uuid;
 update mock_private.attempts set started_at=clock_timestamp()-interval '5 minutes' where attempts.id=v_attempt;
 r:=public.submit_mock_attempt(uid,v_attempt,'{"private-key":"B"}');assert r->>'score'='0' and r->>'reportEligible'='false';
 assert not exists(select 1 from mock_private.verified_assessment_results where verified_assessment_results.id=v_attempt);
 select jsonb_build_array(data||jsonb_build_object('id',practice_questions.id)) into snapshot from public.practice_questions where practice_questions.id='formative-open';
 a:=public.start_mock_attempt(uid,'WAEC','["Economics"]','full',snapshot,true);v_attempt:=(a->>'id')::uuid;
 update mock_private.attempts set started_at=clock_timestamp()-interval '5 minutes' where attempts.id=v_attempt;
 r:=public.submit_mock_attempt(uid,v_attempt,'{"formative-open":"A"}');assert r->>'score'='0' and r->>'reportEligible'='false';
 a:=public.start_mock_attempt(uid,'WAEC','["Economics"]','revision',snapshot,true);v_attempt:=(a->>'id')::uuid;
 update mock_private.attempts set started_at=clock_timestamp()-interval '5 minutes' where attempts.id=v_attempt;
 r:=public.submit_mock_attempt(uid,v_attempt,'{"formative-open":"A"}');assert r->>'score'='1' and r->>'assessmentType'='formative';
 perform pg_temp.denied(format('select public.start_mock_attempt(%L,%L,%L,%L,%L,true)',uid,'WAEC','["Economics"]','trusted',snapshot),'42501');
 insert into mock_private.assessment_questions(id,data) select 'private-key-3',data||'{"question":"Revocation assessment test"}' from mock_private.assessment_questions where assessment_questions.id='private-key';
 select jsonb_build_array(data||jsonb_build_object('id',assessment_questions.id)) into snapshot from mock_private.assessment_questions where assessment_questions.id='private-key-3';
 a:=public.start_mock_attempt(uid,'WAEC','["Economics"]','trusted',snapshot,true);v_attempt:=(a->>'id')::uuid;
 update public.institution_memberships set active=false where user_id=uid;
 r:=public.submit_mock_attempt(uid,v_attempt,'{"private-key-3":"B"}');assert r->>'reportEligible'='false';
end $$;
-- Key pool overlap blocked both ways, including privileged import errors.
insert into public.practice_questions(id,data) values('deleted-public-key','{"question":"Previously exposed test","correctAnswer":"A"}');
delete from public.practice_questions where id='deleted-public-key';
select pg_temp.denied($q$insert into mock_private.assessment_questions(id,data) values('fresh-id','{"question":"Previously exposed test","publicationStatus":"approved","correctAnswer":"A"}')$q$,'P0001');
select pg_temp.denied($q$insert into public.practice_questions(id,data) select id,data from mock_private.assessment_questions$q$,'P0001');
-- Validated retail awards are once-only; unknown lessons and forged sessions fail.
insert into public.lessons(id,data) values('security-lesson','{"subject":"Economics"}');
do $$ declare u uuid:='f0000000-0000-4000-8000-000000000003'; id uuid:=gen_random_uuid(); r jsonb; before_xp integer; begin
 r:=public.retail_reward(u,'lesson','{"lesson":"security-lesson"}');assert r->>'xp'='10';
 r:=public.retail_reward(u,'lesson','{"lesson":"security-lesson"}');assert r->>'duplicate'='true';
 perform pg_temp.denied(format('select public.retail_reward(%L,%L,%L)',u,'lesson','{"lesson":"unknown"}'),'P0001');
 perform public.register_practice_session(u,id,'[{"id":"q1","subject":"Economics","correctAnswer":"B"}]');
 r:=public.retail_reward(u,'practice',jsonb_build_object('session',id,'question','q1','answer','B'));assert r->>'xp'='10';
 r:=public.retail_reward(u,'practice',jsonb_build_object('session',id,'question','q1','answer','A'));assert r->>'duplicate'='true';
 assert (select data->>'totalQuestionsCorrect' from public.users where public.users.id=u::text)='1';
 assert public.verified_reward_totals(u)->>'xp'='20';
 update public.users set data=data||'{"coins":1000}' where public.users.id=u::text;
 r:=public.retail_reward(u,'purchase','{"item":"streak_freeze","price":0}');assert r->>'balance'='800';
 r:=public.retail_reward(u,'purchase','{"item":"streak_freeze","price":0}');assert r->>'balance'='800';
 perform pg_temp.denied(format('select public.retail_reward(%L,%L,%L)',u,'purchase','{"item":"free-fake","price":0}'),'P0001');
end $$;
do $$ declare u uuid:='f0000000-0000-4000-8000-000000000004'; id uuid:=gen_random_uuid(); r jsonb; begin
 insert into mock_private.reward_events(user_id,event_key,xp,coins) select u,'practice:cap-'||n,0,0 from generate_series(1,100)n;
 perform public.register_practice_session(u,id,'[{"id":"cap-q","subject":"Economics","correctAnswer":"B"}]');
 r:=public.retail_reward(u,'practice',jsonb_build_object('session',id,'question','cap-q','answer','B'));assert r->>'xp'='0';
 assert (select data->>'totalQuestionsCorrect' from public.users where public.users.id=u::text)='1';
end $$;
insert into institutional_private.audit(action,occurred_at) values('expired-test',now()-interval '181 days'),('keep-test',now()-interval '179 days');
select public.prune_institutional_audit();
do $$ begin assert not exists(select 1 from institutional_private.audit where action='expired-test');assert exists(select 1 from institutional_private.audit where action='keep-test');end $$;
rollback;
\echo 'Targeted security: private keys, RPC guards, deadlines, grace, reports, invite quotas, rewards and retention passed.'
