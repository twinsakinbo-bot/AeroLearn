-- Synthetic-only fixtures. Actual PostgreSQL roles/RLS, never a service client.
\set ON_ERROR_STOP on
begin;
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
 select ('a0000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns void language sql as $$
 select set_config('request.jwt.claim.sub',pg_temp.uid(n)::text,true)::text;
$$;
create function pg_temp.denied(q text, expected text default '42501') returns void language plpgsql as $$
begin
 begin execute q; exception when others then
  if sqlstate=expected then return; end if; raise;
 end;
 raise exception 'Unexpected authorization success: %',q;
end $$;
insert into auth.users(id,email,email_confirmed_at) select pg_temp.uid(n),'synthetic-'||n||'@example.invalid',case when n<>9 then now() end from generate_series(1,11) n;
update public.users set data=data||'{"subscription":"term","displayName":"Synthetic retail"}' where id=pg_temp.uid(10)::text;
insert into institutional_private.operators(user_id) values(pg_temp.uid(1));
-- A historic learner message remains private even if no longer a participant.
insert into public.conversations(id,data) values('historic-school-thread','{"participants":["a0000000-0000-4000-8000-000000000010"]}');
insert into public.messages(id,parent_id,data) values('historic-school-message','historic-school-thread','{"senderId":"a0000000-0000-4000-8000-000000000006","text":"Synthetic only"}');
create temp table fixtures(k text primary key,v jsonb);
grant all on fixtures to authenticated;
set local role authenticated;
select pg_temp.login(1);
select pg_temp.denied($q$select public.institutional_command('create_institution',null,'{"name":"Flag disabled"}')$q$);
reset role;
update institutional_private.controls set enabled=true;
set local role authenticated;
do $$
declare a uuid; b uuid; ca uuid; ca2 uuid; cb uuid; ma uuid; mb uuid; la uuid; lb uuid; extra uuid;
 inv jsonb; inv2 jsonb; r jsonb;
begin
 assert current_user='authenticated','Tests must use caller role';
 perform pg_temp.login(1);
 a:=(public.institutional_command('create_institution',null,'{"name":"Synthetic School A"}')->>'institution_id')::uuid;
 b:=(public.institutional_command('create_institution',null,'{"name":"Synthetic School B"}')->>'institution_id')::uuid;
 insert into fixtures values('a',to_jsonb(a)),('b',to_jsonb(b));
 inv:=public.institutional_command('invite_staff',a,'{"email":"synthetic-2@example.invalid","role":"school_admin"}');
 inv2:=public.institutional_command('invite_staff',b,'{"email":"synthetic-4@example.invalid","role":"school_admin"}');
 perform pg_temp.login(8);
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','accept_invite',a,jsonb_build_object('token',inv->>'token')));
 assert (select count(*) from public.institutions)=0,'Outsider reads institutions';
 perform pg_temp.login(2);
 perform public.institutional_command('accept_invite',a,jsonb_build_object('token',inv->>'token'));
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','accept_invite',a,jsonb_build_object('token',inv->>'token')));
 ca:=(public.institutional_command('create_cohort',a,'{"name":"A One"}')->>'id')::uuid;
 ca2:=(public.institutional_command('create_cohort',a,'{"name":"A Two"}')->>'id')::uuid;
 inv:=public.institutional_command('invite_staff',a,'{"email":"synthetic-3@example.invalid","role":"teacher"}');
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','invite_staff',a,'{"email":"synthetic-8@example.invalid","role":"school_admin"}'),'22023');
 perform pg_temp.login(3);
 ma:=(public.institutional_command('accept_invite',a,jsonb_build_object('token',inv->>'token'))->>'id')::uuid;
 assert (select count(*) from public.school_cohorts)=0,'Unassigned teacher reads cohort';
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','create_cohort',a,'{"name":"Escalation"}'));
 perform pg_temp.login(4);
 perform public.institutional_command('accept_invite',b,jsonb_build_object('token',inv2->>'token'));
 cb:=(public.institutional_command('create_cohort',b,'{"name":"B One"}')->>'id')::uuid;
 inv:=public.institutional_command('invite_staff',b,'{"email":"synthetic-5@example.invalid","role":"teacher"}');
 assert (select count(*) from public.institutions)=1,'School B sees A';
 assert (select count(*) from public.school_cohorts where institution_id=a)=0,'Cross school export/read';
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','create_cohort',a,'{"name":"Foreign"}'));
 perform pg_temp.login(5);
 mb:=(public.institutional_command('accept_invite',b,jsonb_build_object('token',inv->>'token'))->>'id')::uuid;
 perform pg_temp.login(1);
 la:=(public.institutional_command('enroll_learner',a,jsonb_build_object('user_id',pg_temp.uid(6),'alias','A-001'))->>'id')::uuid;
 lb:=(public.institutional_command('enroll_learner',b,jsonb_build_object('user_id',pg_temp.uid(7),'alias','B-001'))->>'id')::uuid;
 extra:=(public.institutional_command('enroll_learner',a,jsonb_build_object('user_id',pg_temp.uid(11),'alias','A-002'))->>'id')::uuid;
 perform public.institutional_command('assign_cohort',a,jsonb_build_object('membership_id',ma,'cohort_id',ca));
 perform public.institutional_command('assign_cohort',a,jsonb_build_object('membership_id',la,'cohort_id',ca));
 perform public.institutional_command('assign_cohort',a,jsonb_build_object('membership_id',extra,'cohort_id',ca2));
 perform public.institutional_command('assign_cohort',b,jsonb_build_object('membership_id',mb,'cohort_id',cb));
 perform public.institutional_command('assign_cohort',b,jsonb_build_object('membership_id',lb,'cohort_id',cb));
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','assign_cohort',a,jsonb_build_object('membership_id',la,'cohort_id',cb)),'23503');
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','assign_cohort',a,jsonb_build_object('membership_id',lb,'cohort_id',ca)));
 insert into fixtures values('ca',to_jsonb(ca)),('ma',to_jsonb(ma)),('la',to_jsonb(la));
 -- Teacher: assigned cohort and its roster only, no private profile/contact access.
 perform pg_temp.login(3);
 assert (select count(*) from public.school_cohorts)=1,'Teacher can read unassigned cohorts';
 assert (select count(*) from public.institution_memberships)=2,'Teacher roster scope';
 assert (select count(*) from public.users where id=pg_temp.uid(6)::text)=0,'Teacher reads learner private profile';
 assert (select count(*) from public.institutions where id=b)=0,'Teacher cross-school';
 perform pg_temp.denied(format('update public.institution_memberships set role=%L where id=%L','school_admin',ma));
 perform pg_temp.denied(format('delete from public.school_cohorts where id=%L',ca));
 perform pg_temp.denied('select * from institutional_private.audit');
 -- Learner: self only, community disabled, profiles hidden even from retail users.
 perform pg_temp.login(6);
 assert (select count(*) from public.institution_memberships)=1,'Learner reads another member';
 assert (select count(*) from public.cohort_memberships)=1,'Learner reads classmates';
 assert (select count(*) from public.public_profiles)=0,'Learner accesses public discovery';
 assert (select count(*) from public.school_cohorts)=1,'Learner cohort scope';
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','invite_staff',a,'{"email":"synthetic-8@example.invalid","role":"teacher"}'));
 perform pg_temp.denied($q$insert into public.conversations(id,data) values('blocked','{"participants":["a0000000-0000-4000-8000-000000000006"]}')$q$);
 perform pg_temp.login(10);
 assert (select count(*) from public.public_profiles where id=pg_temp.uid(6)::text)=0,'Retail discovers learner';
 assert (select count(*) from public.messages where id='historic-school-message')=0,'Historic learner message disclosed';
 assert (select data->>'subscription' from public.users where id=pg_temp.uid(10)::text)='term','Retail plan changed';
 assert (select count(*) from public.public_profiles where id=pg_temp.uid(10)::text)=1,'Retail public profile broken';
 perform pg_temp.denied($q$insert into public.conversations(id,data) values('blocked-retail','{"participants":["a0000000-0000-4000-8000-000000000010","a0000000-0000-4000-8000-000000000006"]}')$q$);
 -- Immediate removal of assigned teacher scope.
 perform pg_temp.login(2);
 perform public.institutional_command('remove_from_cohort',a,jsonb_build_object('membership_id',ma,'cohort_id',ca));
 perform pg_temp.login(3);
 assert (select count(*) from public.school_cohorts)=0,'Assignment removal stale';
 perform pg_temp.login(2);
 perform public.institutional_command('assign_cohort',a,jsonb_build_object('membership_id',ma,'cohort_id',ca));
 perform public.institutional_command('revoke_member',a,jsonb_build_object('id',ma));
 perform pg_temp.login(3);
 assert (select count(*) from public.institutions)=0,'Revoked member reads school';
 assert (select count(*) from public.cohort_memberships)=0,'Revoked member reads roster';
 assert (select count(*) from public.institution_memberships)=0,'Revoked member reads membership';
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','create_cohort',a,'{"name":"Revoked"}'));
 -- Verified invite expiry/revocation and account binding.
 perform pg_temp.login(2);
 inv:=public.institutional_command('invite_staff',a,'{"email":"synthetic-8@example.invalid","role":"teacher"}');
 perform public.institutional_command('revoke_invite',a,jsonb_build_object('id',inv->>'id'));
 perform pg_temp.login(8);
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','accept_invite',a,jsonb_build_object('token',inv->>'token')));
 perform pg_temp.login(2);
 inv:=public.institutional_command('invite_staff',a,'{"email":"synthetic-9@example.invalid","role":"teacher"}');
 perform pg_temp.login(9);
 perform pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','accept_invite',a,jsonb_build_object('token',inv->>'token')));
 perform pg_temp.login(2);
 inv:=public.institutional_command('invite_staff',a,'{"email":"synthetic-8@example.invalid","role":"teacher"}');
 insert into fixtures values('expired_invite',inv);
 -- Multi-school staff is allowed, each context still filters independently.
 perform pg_temp.login(4);
 inv:=public.institutional_command('invite_staff',b,'{"email":"synthetic-2@example.invalid","role":"teacher"}');
 perform pg_temp.login(2);
 perform public.institutional_command('accept_invite',b,jsonb_build_object('token',inv->>'token'));
 assert (select count(*) from public.institutions)=2,'Multi-school membership missing';
 assert (select count(*) from public.school_cohorts where institution_id=b)=0,'Second membership inherits admin role';
 -- Withdrawal and deletion leave privacy protection in place and preserve retail.
 perform pg_temp.login(6);
 perform public.institutional_command('withdraw',a,'{}');
 assert (select count(*) from public.institutions)=0,'Withdrawn learner has school access';
 assert (select count(*) from public.public_profiles)=0,'Withdrawal republishes learner';
 perform pg_temp.login(2);
 perform public.institutional_command('delete_learner_membership',a,jsonb_build_object('id',la));
 assert (select count(*) from public.institution_memberships where id=la)=0,'Deletion retains membership';
 perform pg_temp.login(10);
 assert (select count(*) from public.public_profiles where id=pg_temp.uid(6)::text)=0,'Deletion republishes learner';
end $$;
reset role;
delete from auth.users where id=pg_temp.uid(6);
set local role authenticated;
select pg_temp.login(10);
do $$ begin assert (select count(*) from public.messages where id='historic-school-message')=0,'Auth deletion exposes historic content'; end $$;
reset role;
update institutional_private.staff_invites set expires_at=now()-interval '1 second' where id=(select (v->>'id')::uuid from fixtures where k='expired_invite');
-- Immutability also applies to a privileged maintenance writer.
select pg_temp.denied(format('update public.school_cohorts set institution_id=%L where id=%L',(select v#>>'{}' from fixtures where k='b'),(select v#>>'{}' from fixtures where k='ca')));
do $$ begin
 assert exists(select 1 from institutional_private.audit where action='revoke_member' and actor_id=pg_temp.uid(2) and occurred_at is not null),'Audit actor/time missing';
 assert exists(select 1 from institutional_private.audit where action='operator_insert'),'Operator bootstrap not audited';
 assert not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='institutional_private' and has_function_privilege('anon',p.oid,'execute')),'Anon private RPC grant';
 assert not has_function_privilege('anon','public.institutional_command(text,uuid,jsonb)','execute'),'Anon command grant';
 assert not has_table_privilege('authenticated','public.school_cohorts','insert'),'Direct cohort writes allowed';
end $$;
set local role authenticated;
select pg_temp.login(8);
select pg_temp.denied(format('select public.institutional_command(%L,%L,%L)','accept_invite',(select v#>>'{}' from fixtures where k='a'),(select jsonb_build_object('token',v->>'token') from fixtures where k='expired_invite')));
select pg_temp.login(1);
select public.institutional_command('deactivate_institution',(select (v#>>'{}')::uuid from fixtures where k='a'),'{}') is not null as deactivated;
select pg_temp.login(2);
do $$ begin
 assert (select count(*) from public.institutions where id=(select (v#>>'{}')::uuid from fixtures where k='a'))=0,'Deactivated institution visible';
end $$;
reset role;
update institutional_private.controls set enabled=false;
set local role authenticated;
select pg_temp.login(4);
do $$ begin assert (select count(*) from public.institutions)=0,'Disabled DB flag leaks data'; end $$;
reset role;
set local role anon;
select pg_temp.denied('select * from public.institutions');
select pg_temp.denied($q$select public.institutional_command('create_institution',null,'{"name":"Anonymous"}')$q$);
rollback;
\echo 'Institutional security: isolation, roles, invites, revocation, withdrawal, deletion, privacy, flags and retail checks passed.'
