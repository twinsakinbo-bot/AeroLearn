\set ON_ERROR_STOP on
begin;
\i /tmp/aerolearn-licensing-fixture.sql
create function pg_temp.payment_login(n integer) returns void language sql as $$ select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-'||lpad(n::text,12,'0'),true)::text $$;
create function pg_temp.payment_denied(q text,c text) returns void language plpgsql as $$ begin
 begin execute q;exception when others then if sqlstate=c then return;end if;raise;end;
 raise exception 'Unexpected success: %',q;
end $$;
set local role authenticated;
select pg_temp.payment_login(1);
do $$ declare a uuid:='b1000000-0000-4000-8000-000000000001'; b uuid:='b1000000-0000-4000-8000-000000000002';
 ca uuid:='b2000000-0000-4000-8000-000000000001'; cb uuid:='b2000000-0000-4000-8000-000000000002';
 t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); t3 uuid:=gen_random_uuid(); t4 uuid:=gen_random_uuid();
 p jsonb; r record;
begin
 assert institutional_private.canonical_payment_reference(E' \tbank-a: inv - 001\r\n')='BANK-A:INV-001';
 foreach p in array array[jsonb_build_object('id',t1,'cohort_id',ca),jsonb_build_object('id',t2,'cohort_id',ca),jsonb_build_object('id',t3,'cohort_id',cb),jsonb_build_object('id',t4,'cohort_id',ca)] loop
  perform public.institutional_licensing_command('draft_term',case when p->>'id'=t3::text then b else a end,
   p||jsonb_build_object('starts_at',now(),'ends_at',now()+interval '30 days','seat_cap',2,'quoted_minor',10000,'renewal_of',null));
 end loop;
 perform public.institutional_licensing_command('approve_term',a,jsonb_build_object('id',t1,'approval_ref',E' \tbank-a: inv - 001\r\n'));
 select * into r from public.institutional_terms where institution_id=a and id=t1;
 assert r.approval_ref='BANK-A:INV-001' and r.approval_ref_key='BANK-A:INV-001';
 -- Identical reference in a different term of the same school/cohort.
 perform pg_temp.payment_denied(format('select public.institutional_licensing_command(%L,%L,%L)','approve_term',a,jsonb_build_object('id',t2,'approval_ref','BANK-A:INV-001')),'23505');
 -- Case/whitespace variant across another school and cohort.
 perform pg_temp.payment_denied(format('select public.institutional_licensing_command(%L,%L,%L)','approve_term',b,jsonb_build_object('id',t3,'approval_ref','  bank-a :inv-001  ')),'23505');
 assert (select state from public.institutional_terms where id=t3)='draft';
 assert (select approval_ref from public.institutional_terms where id=t3) is null;
 assert not exists(select 1 from public.institutional_license_events where term_id in (t2,t3) and action='approve_term');
 -- Real distinct payment approvals succeed; punctuation remains significant.
 perform public.institutional_licensing_command('approve_term',a,jsonb_build_object('id',t2,'approval_ref','bank-a:inv-002'));
 perform public.institutional_licensing_command('approve_term',b,jsonb_build_object('id',t3,'approval_ref','bank-b:inv-001'));
 perform public.institutional_licensing_command('cancel_term',a,jsonb_build_object('id',t1,'reason','Synthetic cancellation'));
 perform pg_temp.payment_denied(format('select public.institutional_licensing_command(%L,%L,%L)','approve_term',a,jsonb_build_object('id',t4,'approval_ref','bank-A: inv-001')),'23505');
 assert (select approval_ref from public.institutional_terms where id=t1)=r.approval_ref;
 assert (select approved_at from public.institutional_terms where id=t1)=r.approved_at;
 assert (select approved_by from public.institutional_terms where id=t1)=r.approved_by;
 assert (select count(*) from public.institutional_license_events where term_id=t1 and action='approve_term')=1;
 perform pg_temp.payment_denied(format('select public.institutional_licensing_command(%L,%L,%L)','approve_term',a,jsonb_build_object('id',t4,'approval_ref','AB')),'22023');
 perform pg_temp.payment_denied(format('select public.institutional_licensing_command(%L,%L,%L)','approve_term',a,jsonb_build_object('id',t4,'approval_ref',U&'BANK:\00a0INV-003')),'22023');
 perform pg_temp.payment_denied(format('select public.institutional_licensing_command(%L,%L,%L)','approve_term',a,jsonb_build_object('id',t4,'approval_ref',U&'BANK:\0410BC-003')),'22023');
end $$;
reset role;
-- Every writer is covered, even when bypassing the public command wrapper.
do $$ declare old_ref text; target uuid; begin
 select id,approval_ref into target,old_ref from public.institutional_terms where approval_ref='BANK-A:INV-001';
 perform pg_temp.payment_denied(format('update public.institutional_terms set approval_ref=null where id=%L',target),'42501');
 perform pg_temp.payment_denied(format('update public.institutional_terms set approval_ref=%L where id=%L','BANK-A:REPLACED',target),'42501');
 perform pg_temp.payment_denied(format('update public.institutional_terms set quoted_minor=1 where id=%L',target),'42501');
 perform pg_temp.payment_denied(format('delete from public.institutional_terms where id=%L',target),'42501');
 perform pg_temp.payment_denied($q$update public.institutional_terms set approval_ref=' bank-a:inv-001 ' where approval_ref is null$q$,'23505');
 assert (select count(*) from public.institutional_terms where approval_ref_key='BANK-A:INV-001')=1;
end $$;
rollback;
\echo 'Institutional payment canonicalization, global uniqueness, cancelled-term reservation, immutable reconciliation and distinct payments passed.'
