\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values('91000000-0000-4000-8000-000000000001','integrity@example.invalid');
create function pg_temp.denied(q text,code text default '42501') returns void language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate=code then return;else raise;end if;end;
 raise exception 'Unexpected success: %',q;end $$;
-- Every physical profile update must advance exactly once, including direct SQL.
do $$ declare old_v bigint;new_v bigint;begin
 select version into old_v from public.users where id='91000000-0000-4000-8000-000000000001';
 update public.users set data=data||'{"displayName":"Server writer"}',version=99999 where id='91000000-0000-4000-8000-000000000001' returning version into new_v;
 assert new_v=old_v+1,'Server cannot bypass canonical version bump';
 perform public.doc_patch('users','91000000-0000-4000-8000-000000000001',null,'{"photoURL":"local"}','[]',false,new_v,true);
 assert (select version from public.users where id='91000000-0000-4000-8000-000000000001')=new_v+1,'Patch increments exactly once';
 perform pg_temp.denied(format('select * from public.doc_patch(%L,%L,null,%L,%L,false,%s,true)','users','91000000-0000-4000-8000-000000000001','{"coins":0}','[]',old_v),'40001');
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select pg_temp.denied($q$update public.users set version=1 where id='91000000-0000-4000-8000-000000000001'$q$);
select pg_temp.denied($q$select public.verified_quiz_counts('91000000-0000-4000-8000-000000000001')$q$);
select pg_temp.denied($q$select public.claim_login_reward('91000000-0000-4000-8000-000000000001')$q$);
select pg_temp.denied($q$select public.claim_quest_reward('91000000-0000-4000-8000-000000000001','xp',1)$q$);
select pg_temp.denied($q$insert into public.quiz_results(id,data) values('fake-verified-practice','{"userId":"91000000-0000-4000-8000-000000000001","source":"practice_verified","score":999,"totalQuestions":999}')$q$);
select pg_temp.denied($q$insert into public.quiz_results(id,data) values('practice:fake','{"userId":"91000000-0000-4000-8000-000000000001","source":"practice","score":999,"totalQuestions":999}')$q$);
reset role;
-- Canonical counters apply to other document tables too.
select set_config('request.jwt.claim.sub','',true);
update public.users set data=data||'{"role":"admin"}' where id='91000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into public.notes(id,data) values('version-note','{"userId":"91000000-0000-4000-8000-000000000001"}');
set local role authenticated;
select pg_temp.denied($q$update public.notes set version=999 where id='version-note'$q$);
select public.doc_patch('notes','version-note',null,'{"content":"Safe update"}','[]',false,1,true);
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.users set data=data||'{"role":"student"}' where id='91000000-0000-4000-8000-000000000001';
-- A finite code must not shorten an existing permanent entitlement.
select set_config('request.jwt.claim.sub','',true);
update public.users set data=data||'{"subscription":"lifetime","proExpiresAt":null}' where id='91000000-0000-4000-8000-000000000001';
insert into public.licence_codes(id,plan_id,status) values(encode(sha256(convert_to('KEEPFOREVER001','UTF8')),'hex'),'monthly','available');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
do $$ declare r record;begin
 select * into r from public.redeem_licence_code('KEEPFOREVER001','91000000-0000-4000-8000-000000000001');
 assert r.status='ok' and r.plan_id='lifetime' and r.expires_at is null;
end $$;
reset role;
-- Session timezone must not change login days or practice reward quota boundaries.
do $$ declare a jsonb;b jsonb;v bigint; sid uuid:=gen_random_uuid(); begin
 set local timezone='Pacific/Honolulu';
 a:=public.claim_login_reward('91000000-0000-4000-8000-000000000001');
 assert a->>'lastLoginDate'=to_char(clock_timestamp() at time zone 'Africa/Lagos','YYYY-MM-DD');
 select version into v from public.users where id='91000000-0000-4000-8000-000000000001';
 set local timezone='Pacific/Chatham';
 b:=public.claim_login_reward('91000000-0000-4000-8000-000000000001');assert b->>'updated'='false';
 assert (select version from public.users where id='91000000-0000-4000-8000-000000000001')=v,'No-op login retry should not bump version';
 perform public.register_practice_session('91000000-0000-4000-8000-000000000001',sid,'[{"id":"q1","subject":"Economics","correctAnswer":"B"},{"id":"q2","subject":"Economics","correctAnswer":"A"}]');
 perform public.retail_reward('91000000-0000-4000-8000-000000000001','practice',jsonb_build_object('session',sid,'question','q1','answer','B'));
 assert not exists(select 1 from public.quiz_results where data->>'source'='practice_verified');
 perform public.retail_reward('91000000-0000-4000-8000-000000000001','practice',jsonb_build_object('session',sid,'question','q2','answer','B'));
 assert (select data->>'score' from public.quiz_results where data->>'source'='practice_verified')='1';
 assert (select data->>'totalQuestions' from public.quiz_results where data->>'source'='practice_verified')='2';
 perform public.retail_reward('91000000-0000-4000-8000-000000000001','practice',jsonb_build_object('session',sid,'question','q2','answer','A'));
 assert (select count(*) from public.quiz_results where data->>'source'='practice_verified')=1;
 assert (select data->>'score' from public.quiz_results where data->>'source'='practice_verified')='1';
end $$;
do $$ begin
 set local timezone='Pacific/Honolulu';
 assert mock_private.reward_day_start('2026-11-28T22:59:59Z')='2026-11-27T23:00:00Z'::timestamptz;
 set local timezone='Pacific/Chatham';
 assert mock_private.reward_day_start('2026-11-28T23:00:00Z')='2026-11-28T23:00:00Z'::timestamptz;
end $$;
-- Nullable legacy quest state is normalized inside the locked claim.
update public.users set data=data||'{"quests":null}' where id='91000000-0000-4000-8000-000000000001';
insert into mock_private.reward_events(user_id,event_key,xp,coins) values('91000000-0000-4000-8000-000000000001','integrity-quest-target',50,0);
do $$ declare r jsonb;begin
 r:=public.claim_quest_reward('91000000-0000-4000-8000-000000000001','xp',1);
 assert r#>>'{quests,xpTier}'='2';
 r:=public.claim_quest_reward('91000000-0000-4000-8000-000000000001','xp',1);assert r->>'duplicate'='true';
end $$;
-- Old source labels are not certification. Simulate a pre-guard forged row.
insert into public.quiz_results(id,data) values('historical-forged-label','{"userId":"91000000-0000-4000-8000-000000000001","source":"practice_verified","score":999,"totalQuestions":999}');
do $$ declare counts jsonb;begin
 counts:=public.verified_quiz_counts('91000000-0000-4000-8000-000000000001');
 assert counts->>'quizzes'='1' and counts->>'perfect'='0' and counts->>'legacy'='1';
end $$;
-- Inspect the stored function definition to prevent accidental session-zone dependence.
do $$ begin assert position('reward_day_start' in pg_get_functiondef('public.retail_reward(uuid,text,jsonb)'::regprocedure))>0;end $$;
rollback;
\echo 'Profile integrity: canonical versions, CAS rejection, metadata guards, atomic login, verified practice and explicit timezone passed.'
