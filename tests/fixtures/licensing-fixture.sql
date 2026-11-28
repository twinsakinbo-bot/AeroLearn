-- Dedicated synthetic IDs. Called inside rolled-back policy tests or disposable DB race tests.
insert into auth.users(id,email,email_confirmed_at) select ('b0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'license-'||n||'@example.invalid',now() from generate_series(1,8)n;
update institutional_private.controls set enabled=true;
update institutional_private.licensing_controls set enabled=true;
insert into institutional_private.operators(user_id) values('b0000000-0000-4000-8000-000000000001');
insert into public.institutions(id,name) values('b1000000-0000-4000-8000-000000000001','Synthetic licensing A'),('b1000000-0000-4000-8000-000000000002','Synthetic licensing B');
insert into public.school_cohorts(institution_id,id,name) values('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','SS3 A'),('b1000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002','SS3 B');
insert into public.institution_memberships(institution_id,id,user_id,role,alias) select
 case when n=7 then 'b1000000-0000-4000-8000-000000000002' else 'b1000000-0000-4000-8000-000000000001' end::uuid,
 ('b3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('b0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=2 then 'school_admin' when n=3 then 'teacher' else 'learner' end,
 case when n>3 then 'Synthetic_'||n end from generate_series(2,7)n;
insert into public.cohort_memberships(institution_id,cohort_id,membership_id) select institution_id,
 case when user_id='b0000000-0000-4000-8000-000000000007' then 'b2000000-0000-4000-8000-000000000002' else 'b2000000-0000-4000-8000-000000000001' end::uuid,id from public.institution_memberships where id::text like 'b3000000-%' and role<>'school_admin';
insert into institutional_private.protected_learners(user_id) select user_id from public.institution_memberships where id::text like 'b3000000-%' and role='learner';
update public.users set data=data||'{"subscription":"lifetime","proExpiresAt":null,"coins":4321,"xp":1234}' where id='b0000000-0000-4000-8000-000000000004';
