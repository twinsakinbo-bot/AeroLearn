-- P0-B: inert until BOTH the institutional and licensing database switches are enabled.
-- No backfill, retail profile mutation, payment provider, assessment activation or scheduler.
begin;
create table institutional_private.licensing_controls(id boolean primary key default true check(id), enabled boolean not null default false);
insert into institutional_private.licensing_controls default values;
create function institutional_private.licensing_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from institutional_private.controls where enabled) and exists(select 1 from institutional_private.licensing_controls where enabled)
$$;
create function institutional_private.licensing_manager(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select institutional_private.licensing_enabled() and exists(select 1 from public.institutions where id=org)
 and (institutional_private.operator() or coalesce(institutional_private.member_role(org)='school_admin',false))
$$;
create table public.institutional_terms (
 institution_id uuid not null references public.institutions(id), id uuid not null,
 cohort_id uuid not null, renewal_of uuid,
 starts_at timestamptz not null, ends_at timestamptz not null, seat_cap integer not null check(seat_cap between 1 and 5000),
 quoted_minor bigint not null check(quoted_minor between 0 and 100000000000), currency text not null default 'NGN' check(currency='NGN'),
 state text not null default 'draft' check(state in ('draft','approved','active','suspended','cancelled')),
 approval_ref text check(length(btrim(approval_ref)) between 3 and 80), approved_by uuid, approved_at timestamptz,
 created_at timestamptz not null default now(), created_by uuid not null,
 primary key(institution_id,id), foreign key(institution_id,cohort_id) references public.school_cohorts(institution_id,id),
 foreign key(institution_id,renewal_of) references public.institutional_terms(institution_id,id),
 check(ends_at>starts_at and ends_at<=starts_at+interval '2 years'),
 check(state not in ('approved','active','suspended') or (approval_ref is not null and approved_by is not null and approved_at is not null))
);
create table public.institutional_batches (
 institution_id uuid not null, id uuid not null, term_id uuid not null,
 quantity integer not null check(quantity between 1 and 100), code_expires_at timestamptz not null,
 issued_by uuid not null, created_at timestamptz not null default now(), cancelled_at timestamptz,
 primary key(institution_id,id), unique(institution_id,term_id,id),
 foreign key(institution_id,term_id) references public.institutional_terms(institution_id,id)
);
create table public.institutional_seats (
 institution_id uuid not null, id uuid not null default gen_random_uuid(), term_id uuid not null,
 batch_id uuid, state text not null default 'available' check(state in ('available','issued','assigned','revoked')),
 primary key(institution_id,id), unique(institution_id,term_id,id),
 foreign key(institution_id,term_id) references public.institutional_terms(institution_id,id),
 foreign key(institution_id,term_id,batch_id) references public.institutional_batches(institution_id,term_id,id)
);
create index institutional_seat_pool on public.institutional_seats(institution_id,term_id,state);
create table public.institutional_grants (
 institution_id uuid not null, id uuid not null default gen_random_uuid(), term_id uuid not null, seat_id uuid not null,
 membership_id uuid, user_id uuid not null, state text not null default 'active' check(state in ('active','suspended','revoked')),
 created_at timestamptz not null default now(),
 primary key(institution_id,id), foreign key(institution_id,term_id,seat_id) references public.institutional_seats(institution_id,term_id,id),
 foreign key(institution_id,membership_id) references public.institution_memberships(institution_id,id) on delete set null (membership_id)
);
create unique index institutional_grant_live_seat on public.institutional_grants(institution_id,seat_id) where state<>'revoked';
create unique index institutional_grant_live_learner on public.institutional_grants(institution_id,term_id,user_id) where state<>'revoked';
create index institutional_grant_self on public.institutional_grants(user_id,institution_id);
create table institutional_private.learner_codes (
 institution_id uuid not null, id uuid primary key default gen_random_uuid(), term_id uuid not null, seat_id uuid not null, batch_id uuid not null,
 verifier text not null unique check(verifier ~ '^[a-f0-9]{64}$'), expires_at timestamptz not null,
 cancelled_at timestamptz, redeemed_by uuid, grant_id uuid, redeemed_at timestamptz,
 foreign key(institution_id,term_id,seat_id) references public.institutional_seats(institution_id,term_id,id),
 foreign key(institution_id,term_id,batch_id) references public.institutional_batches(institution_id,term_id,id),
 foreign key(institution_id,grant_id) references public.institutional_grants(institution_id,id),
 check((redeemed_by is null and redeemed_at is null and grant_id is null) or (redeemed_by is not null and redeemed_at is not null and grant_id is not null))
);
create index institutional_code_seat on institutional_private.learner_codes(institution_id,seat_id) where cancelled_at is null and redeemed_at is null;
create table institutional_private.licensing_limits(actor_id uuid not null,bucket timestamptz not null,attempts integer not null,primary key(actor_id,bucket));
create table public.institutional_license_events (
 institution_id uuid not null references public.institutions(id), id uuid not null default gen_random_uuid(),
 actor_id uuid not null, action text not null, term_id uuid not null, target_id uuid not null,
 reason text check(length(btrim(reason)) between 3 and 160), occurred_at timestamptz not null default now(),
 primary key(institution_id,id), foreign key(institution_id,term_id) references public.institutional_terms(institution_id,id)
);
create index institutional_license_event_time on public.institutional_license_events(institution_id,occurred_at);
do $$ declare t text; begin
 foreach t in array array['institutional_terms','institutional_batches','institutional_seats','institutional_grants','institutional_license_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy manager_read on public.%I for select to authenticated using (institutional_private.licensing_manager(institution_id))',t);
 end loop;
 foreach t in array array['licensing_controls','learner_codes','licensing_limits'] loop
  execute format('alter table institutional_private.%I enable row level security',t);
  execute format('revoke all on institutional_private.%I from public,anon,authenticated',t);
 end loop;
end $$;
-- Learners see only their own historical grant identifiers, never payment records, codes or other learners.
create policy own_grant_read on public.institutional_grants for select to authenticated using (
 institutional_private.licensing_enabled() and user_id=auth.uid() and institutional_private.member_role(institution_id)='learner');

create function institutional_private.entitlement(org uuid,uid uuid) returns jsonb language sql volatile security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('namespace','institutional_revision','institution_id',g.institution_id,'term_id',g.term_id,
  'grant_id',g.id,'cohort_id',t.cohort_id,'expires_at',t.ends_at,'capabilities',jsonb_build_array('formative_mock'))
 from public.institutional_grants g join public.institutional_terms t on (t.institution_id,t.id)=(g.institution_id,g.term_id)
 join public.institutions i on i.id=g.institution_id
 join public.institution_memberships m on (m.institution_id,m.id)=(g.institution_id,g.membership_id)
 join public.cohort_memberships c on (c.institution_id,c.membership_id,c.cohort_id)=(m.institution_id,m.id,t.cohort_id)
 where institutional_private.licensing_enabled() and i.active and m.active and m.role='learner' and m.user_id=uid and g.user_id=uid
 and g.institution_id=org and g.state='active' and t.state='active' and clock_timestamp()>=t.starts_at and clock_timestamp()<t.ends_at
 order by t.ends_at desc limit 1),'null'::jsonb)
$$;
-- Private helpers may not be invoked with another learner's identity by a client.
revoke all on function institutional_private.entitlement(uuid,uuid) from public,anon,authenticated;
create function public.institutional_licensing_context(p_institution_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare op boolean; org uuid:=p_institution_id; r text; school_active boolean;
begin
 if auth.uid() is null or not institutional_private.licensing_enabled() then raise exception 'Licensing unavailable' using errcode='42501'; end if;
 op:=institutional_private.operator();
 if org is null then
  return jsonb_build_object('operator',op,'institutions',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'active',i.active) order by i.name)
   from public.institutions i where op or (i.active and institutional_private.member_role(i.id) is not null)),'[]'::jsonb));
 end if;
 select active into school_active from public.institutions where id=org;
 r:=institutional_private.member_role(org);
 if not found or (not op and r is null) then raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object('operator',op,'role',r,'institution_active',school_active,'entitlement',institutional_private.entitlement(org,auth.uid()),
 'cohorts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.school_cohorts where institution_id=org and (op or institutional_private.cohort_access(org,id))),'[]'::jsonb));
end $$;

create function institutional_private.licensing_command(p_action text,p_institution_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=p_institution_id; actor uuid:=auth.uid(); op boolean; manager boolean;
 t public.institutional_terms%rowtype; b public.institutional_batches%rowtype; s public.institutional_seats%rowtype;
 g public.institutional_grants%rowtype; code institutional_private.learner_codes%rowtype;
 member_id uuid; target uuid; v_term_id uuid; token text; expires timestamptz; n integer; used integer; reason text;
 result jsonb:='{}'; delivered jsonb:='[]'; expected_keys text[];
begin
 if actor is null or not institutional_private.licensing_enabled() then raise exception 'Licensing unavailable' using errcode='42501'; end if;
 -- Same lock order as P0-A membership, cohort and institution mutations. Authorization is checked AFTER this lock.
 perform 1 from public.institutions where id=org and active for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 op:=institutional_private.operator(); manager:=op or coalesce(institutional_private.member_role(org)='school_admin',false);
 if p_action='redeem' then
  expected_keys:=array['code'];
 elsif p_action='draft_term' then expected_keys:=array['id','cohort_id','starts_at','ends_at','seat_cap','quoted_minor','renewal_of'];
 elsif p_action='approve_term' then expected_keys:=array['id','approval_ref'];
 elsif p_action in ('activate_term') then expected_keys:=array['id'];
 elsif p_action in ('cancel_term','suspend_term','resume_term','cancel_batch','suspend_grant','resume_grant','release_seat') then expected_keys:=array['id','reason'];
 elsif p_action='revoke_grant' then expected_keys:=array['id','reason','reclaim'];
 elsif p_action='issue_batch' then expected_keys:=array['id','term_id','quantity','expires_at'];
 else raise exception 'Unknown command' using errcode='22023'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or not (p_payload ?& expected_keys) or (p_payload-expected_keys)<>'{}'::jsonb then raise exception 'Invalid command fields' using errcode='22023'; end if;
 reason:=p_payload->>'reason';
 if 'reason'=any(expected_keys) and (reason is null or length(btrim(reason)) not between 3 and 160 or reason ~ '[[:cntrl:]]') then raise exception 'Reason required' using errcode='22023'; end if;
 if p_action='redeem' then
  -- Membership is not established by possession of a code; P0-A operator enrollment must precede claim.
  select id into member_id from public.institution_memberships where institution_id=org and user_id=actor and active and role='learner';
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  insert into institutional_private.licensing_limits(actor_id,bucket,attempts) values(actor,date_trunc('hour',clock_timestamp() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos',1)
   on conflict(actor_id,bucket) do update set attempts=institutional_private.licensing_limits.attempts+1 where institutional_private.licensing_limits.attempts<20 returning attempts into used;
  if not found then return jsonb_build_object('error','rate_limited'); end if;
  -- Expected failures return rather than raise so failed guesses consume the transactional quota.
  if (p_payload->>'code') is null or (p_payload->>'code') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','invalid_code'); end if;
  select * into code from institutional_private.learner_codes where institution_id=org and verifier=encode(sha256(convert_to(p_payload->>'code','UTF8')),'hex') for update;
  if not found or code.cancelled_at is not null then return jsonb_build_object('error','invalid_code'); end if;
  select * into t from public.institutional_terms where institution_id=org and id=code.term_id;
  if t.state<>'active' or clock_timestamp()<t.starts_at or clock_timestamp()>=t.ends_at or
   not exists(select 1 from public.cohort_memberships where institution_id=org and cohort_id=t.cohort_id and membership_id=member_id) then return jsonb_build_object('error','invalid_code'); end if;
  if code.redeemed_at is not null then
   if code.redeemed_by=actor then
    select * into g from public.institutional_grants where institution_id=org and id=code.grant_id;
    return jsonb_build_object('id',g.id,'state',g.state,'replayed',true);
   end if;
   return jsonb_build_object('error','invalid_code');
  end if;
  if code.expires_at<=clock_timestamp() then return jsonb_build_object('error','invalid_code'); end if;
  -- Includes suspended grants. A new code must not silently revive a suspended learner.
  if exists(select 1 from public.institutional_grants x join public.institutional_terms y on (y.institution_id,y.id)=(x.institution_id,x.term_id)
   where x.institution_id=org and x.user_id=actor and x.state<>'revoked' and y.cohort_id=t.cohort_id and y.state<>'cancelled'
   and tstzrange(y.starts_at,y.ends_at,'[)') && tstzrange(t.starts_at,t.ends_at,'[)')) then return jsonb_build_object('error','existing_grant'); end if;
  select * into s from public.institutional_seats where institution_id=org and id=code.seat_id for update;
  if s.state<>'issued' or s.batch_id<>code.batch_id then return jsonb_build_object('error','invalid_code'); end if;
  insert into public.institutional_grants(institution_id,term_id,seat_id,membership_id,user_id) values(org,t.id,s.id,member_id,actor) returning id into target;
  update public.institutional_seats set state='assigned' where institution_id=org and id=s.id;
  update institutional_private.learner_codes set redeemed_by=actor,redeemed_at=clock_timestamp(),grant_id=target where id=code.id;
  v_term_id:=t.id; result:=jsonb_build_object('state','active');
 else
  if not manager then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_action='draft_term' then
   if not op then raise exception 'Operator required' using errcode='42501'; end if;
   target:=(p_payload->>'id')::uuid;
   select * into t from public.institutional_terms where institution_id=org and id=target;
   if found then
    if (t.cohort_id,t.starts_at,t.ends_at,t.seat_cap,t.quoted_minor,t.renewal_of) is distinct from
     ((p_payload->>'cohort_id')::uuid,(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,(p_payload->>'seat_cap')::integer,(p_payload->>'quoted_minor')::bigint,(p_payload->>'renewal_of')::uuid)
     then raise exception 'Request identity reused' using errcode='22023'; end if;
    return jsonb_build_object('id',target,'replayed',true);
   end if;
   if p_payload->>'renewal_of' is not null and not exists(select 1 from public.institutional_terms where institution_id=org and id=(p_payload->>'renewal_of')::uuid and cohort_id=(p_payload->>'cohort_id')::uuid and ends_at<=(p_payload->>'starts_at')::timestamptz) then raise exception 'Invalid renewal' using errcode='22023'; end if;
   insert into public.institutional_terms(institution_id,id,cohort_id,starts_at,ends_at,seat_cap,quoted_minor,renewal_of,created_by)
    values(org,target,(p_payload->>'cohort_id')::uuid,(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,(p_payload->>'seat_cap')::integer,(p_payload->>'quoted_minor')::bigint,(p_payload->>'renewal_of')::uuid,actor);
   v_term_id:=target;
  elsif p_action='issue_batch' then
   select * into t from public.institutional_terms where institution_id=org and id=(p_payload->>'term_id')::uuid for update;
   if not found or t.state<>'active' or clock_timestamp()>=t.ends_at then raise exception 'Term unavailable' using errcode='22023'; end if;
   select * into b from public.institutional_batches where institution_id=org and id=(p_payload->>'id')::uuid;
   if found then
    if b.term_id<>t.id or b.quantity<>(p_payload->>'quantity')::integer or b.code_expires_at<>(p_payload->>'expires_at')::timestamptz then raise exception 'Request identity reused' using errcode='22023'; end if;
    return jsonb_build_object('id',b.id,'replayed',true,'codes','[]'::jsonb,'message','Codes are shown once. Cancel unused codes before issuing replacements.');
   end if;
   -- Reclaim expired, unused reservations transactionally. History and verifier records remain for audit.
   update institutional_private.learner_codes set cancelled_at=clock_timestamp() where institution_id=org and term_id=t.id and redeemed_at is null and cancelled_at is null and expires_at<=clock_timestamp();
   update public.institutional_seats x set state='available',batch_id=null where x.institution_id=org and x.term_id=t.id and x.state='issued'
    and not exists(select 1 from institutional_private.learner_codes c where c.institution_id=org and c.seat_id=x.id and c.cancelled_at is null and c.redeemed_at is null);
   n:=(p_payload->>'quantity')::integer; expires:=(p_payload->>'expires_at')::timestamptz;
   if n is null or n not between 1 and 100 or expires is null or expires<=greatest(clock_timestamp(),t.starts_at) or expires>least(clock_timestamp()+interval '7 days',t.ends_at) then raise exception 'Invalid batch' using errcode='22023'; end if;
   -- Shared rolling school quota; retries return above, cancelled batches still count.
   if (select count(*)>=20 or coalesce(sum(quantity),0)+n>1000 from public.institutional_batches where institution_id=org and created_at>clock_timestamp()-interval '1 hour') then raise exception 'School issuance quota reached' using errcode='P0001'; end if;
   if (select count(*) from public.institutional_seats where institution_id=org and term_id=t.id and state='available')<n then raise exception 'Insufficient seats' using errcode='54000'; end if;
   target:=(p_payload->>'id')::uuid;
   insert into public.institutional_batches(institution_id,id,term_id,quantity,code_expires_at,issued_by) values(org,target,t.id,n,expires,actor);
   for s in select * from public.institutional_seats where institution_id=org and term_id=t.id and state='available' order by id limit n for update loop
    token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    insert into institutional_private.learner_codes(institution_id,term_id,seat_id,batch_id,verifier,expires_at)
     values(org,t.id,s.id,target,encode(sha256(convert_to(token,'UTF8')),'hex'),expires);
    update public.institutional_seats set state='issued',batch_id=target where institution_id=org and id=s.id;
    delivered:=delivered||jsonb_build_array(jsonb_build_object('seat_id',s.id,'code',token));
   end loop;
   v_term_id:=t.id; result:=jsonb_build_object('codes',delivered,'expires_at',expires);
  elsif p_action='cancel_batch' then
   select * into b from public.institutional_batches where institution_id=org and id=(p_payload->>'id')::uuid for update;
   if not found then raise exception 'Forbidden' using errcode='42501'; end if;
   update institutional_private.learner_codes set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where institution_id=org and batch_id=b.id and redeemed_at is null;
   update public.institutional_seats set state='available',batch_id=null where institution_id=org and batch_id=b.id and state='issued';
   update public.institutional_batches set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where institution_id=org and id=b.id;
   v_term_id:=b.term_id; target:=b.id;
  elsif p_action in ('suspend_grant','resume_grant','revoke_grant','release_seat') then
   if p_action<>'suspend_grant' and not op then raise exception 'Operator required' using errcode='42501'; end if;
   if p_action='release_seat' then
    select * into s from public.institutional_seats where institution_id=org and id=(p_payload->>'id')::uuid for update;
    if not found or s.state<>'revoked' or exists(select 1 from public.institutional_grants x join public.institution_memberships m on (m.institution_id,m.id)=(x.institution_id,x.membership_id)
     join public.institutional_terms y on (y.institution_id,y.id)=(x.institution_id,x.term_id)
     join public.cohort_memberships c on (c.institution_id,c.membership_id,c.cohort_id)=(m.institution_id,m.id,y.cohort_id)
     where x.institution_id=org and x.seat_id=s.id and m.active) then raise exception 'Offboard learner before reassignment' using errcode='22023'; end if;
    update public.institutional_seats set state='available',batch_id=null where institution_id=org and id=s.id;
    target:=s.id; v_term_id:=s.term_id;
   else
    select * into g from public.institutional_grants where institution_id=org and id=(p_payload->>'id')::uuid for update;
    if not found or g.state='revoked' then raise exception 'Grant unavailable' using errcode='22023'; end if;
    if p_action='revoke_grant' then
     if jsonb_typeof(p_payload->'reclaim')<>'boolean' then raise exception 'Explicit reclaim policy required' using errcode='22023'; end if;
     if (p_payload->>'reclaim')::boolean and exists(select 1 from public.institution_memberships m join public.institutional_terms y on y.institution_id=m.institution_id
      join public.cohort_memberships c on (c.institution_id,c.membership_id,c.cohort_id)=(m.institution_id,m.id,y.cohort_id)
      where m.institution_id=org and m.id=g.membership_id and m.active and y.id=g.term_id) then raise exception 'Offboard learner before reassignment' using errcode='22023'; end if;
     update public.institutional_grants set state='revoked' where institution_id=org and id=g.id;
     update public.institutional_seats set state=case when (p_payload->>'reclaim')::boolean then 'available' else 'revoked' end,batch_id=null where institution_id=org and id=g.seat_id;
    else
     if p_action='resume_grant' and not exists(select 1 from public.institution_memberships m join public.institutional_terms y on y.institution_id=m.institution_id
      join public.cohort_memberships c on (c.institution_id,c.membership_id,c.cohort_id)=(m.institution_id,m.id,y.cohort_id)
      where m.institution_id=org and m.id=g.membership_id and m.active and y.id=g.term_id and y.state='active' and clock_timestamp()<y.ends_at) then raise exception 'Grant unavailable' using errcode='22023'; end if;
     update public.institutional_grants set state=case when p_action='resume_grant' then 'active' else 'suspended' end where institution_id=org and id=g.id;
    end if;
    target:=g.id; v_term_id:=g.term_id;
   end if;
  else
   if not op then raise exception 'Operator required' using errcode='42501'; end if;
   select * into t from public.institutional_terms where institution_id=org and id=(p_payload->>'id')::uuid for update;
   if not found then raise exception 'Forbidden' using errcode='42501'; end if;
   target:=t.id; v_term_id:=t.id;
   case p_action
   when 'approve_term' then
    if t.state<>'draft' or length(btrim(p_payload->>'approval_ref')) not between 3 and 80 or (p_payload->>'approval_ref') ~ '[[:cntrl:]]' then raise exception 'Invalid approval' using errcode='22023'; end if;
    update public.institutional_terms set state='approved',approval_ref=p_payload->>'approval_ref',approved_by=actor,approved_at=clock_timestamp() where institution_id=org and id=t.id;
   when 'activate_term','resume_term' then
    if t.state<>(case when p_action='activate_term' then 'approved' else 'suspended' end) or clock_timestamp()>=t.ends_at then raise exception 'Invalid activation' using errcode='22023'; end if;
    if exists(select 1 from public.institutional_terms x where x.institution_id=org and x.cohort_id=t.cohort_id and x.id<>t.id and x.state in ('active','suspended') and tstzrange(x.starts_at,x.ends_at,'[)') && tstzrange(t.starts_at,t.ends_at,'[)')) then raise exception 'Overlapping term' using errcode='22023'; end if;
    update public.institutional_terms set state='active' where institution_id=org and id=t.id;
    if p_action='activate_term' then insert into public.institutional_seats(institution_id,term_id) select org,t.id from generate_series(1,t.seat_cap); end if;
   when 'suspend_term' then
    if t.state<>'active' then raise exception 'Invalid suspension' using errcode='22023'; end if;
    update public.institutional_terms set state='suspended' where institution_id=org and id=t.id;
   when 'cancel_term' then
    update public.institutional_terms set state='cancelled' where institution_id=org and id=t.id;
    update institutional_private.learner_codes set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where institution_id=org and term_id=t.id and redeemed_at is null;
   end case;
  end if;
 end if;
 insert into public.institutional_license_events(institution_id,actor_id,action,term_id,target_id,reason) values(org,actor,p_action,v_term_id,target,reason);
 return result||jsonb_build_object('id',target);
end $$;
create function public.institutional_licensing_command(p_action text,p_institution_id uuid,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select institutional_private.licensing_command(p_action,p_institution_id,p_payload)
$$;
create function public.institutional_licensing_dashboard(p_institution_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or institutional_private.licensing_manager(p_institution_id) is not true then raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object(
 'terms',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
  select t.*,
   case when not exists(select 1 from public.institutions where id=t.institution_id and active) then 'school inactive'
    when t.state in ('active','suspended','approved') and clock_timestamp()>=t.ends_at then 'expired'
    when t.state='active' and clock_timestamp()<t.starts_at then 'scheduled' else t.state end as effective_state,
   (select count(*) from public.institutional_seats s where s.institution_id=t.institution_id and s.term_id=t.id and s.state='assigned') as assigned,
   (select count(*) from public.institutional_grants g where g.institution_id=t.institution_id and g.term_id=t.id and g.state='suspended') as suspended,
   (select count(*) from public.institutional_seats s where s.institution_id=t.institution_id and s.term_id=t.id and s.state='revoked') as frozen,
   (select count(*) from public.institutional_seats s where s.institution_id=t.institution_id and s.term_id=t.id and s.state='issued' and exists(
    select 1 from institutional_private.learner_codes c where c.institution_id=s.institution_id and c.seat_id=s.id and c.redeemed_at is null and c.cancelled_at is null and c.expires_at>clock_timestamp())) as reserved,
   (select count(*) from public.institutional_seats s where s.institution_id=t.institution_id and s.term_id=t.id and (s.state='available' or (s.state='issued' and not exists(
    select 1 from institutional_private.learner_codes c where c.institution_id=s.institution_id and c.seat_id=s.id and c.redeemed_at is null and c.cancelled_at is null and c.expires_at>clock_timestamp())))) as available
  from public.institutional_terms t where t.institution_id=p_institution_id order by created_at desc limit 100) x),'[]'::jsonb),
 'batches',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.institutional_batches where institution_id=p_institution_id order by created_at desc limit 100) x),'[]'::jsonb),
 'grants',coalesce((select jsonb_agg(to_jsonb(x)) from (select g.*,m.alias from public.institutional_grants g left join public.institution_memberships m on (m.institution_id,m.id)=(g.institution_id,g.membership_id)
  where g.institution_id=p_institution_id order by g.created_at desc limit 100) x),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.institutional_license_events where institution_id=p_institution_id order by occurred_at desc limit 100) x),'[]'::jsonb),
 'list_limit',100);
end $$;
revoke all on function public.institutional_licensing_dashboard(uuid) from public,anon;
grant execute on function public.institutional_licensing_dashboard(uuid) to authenticated;
-- Service-only bridge. Lock + live entitlement validation and attempt start share one transaction.
create function public.start_institutional_mock(p_uid uuid,p_institution_id uuid,p_exam text,p_subjects jsonb,p_mode text,p_questions jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.institutions where id=p_institution_id and active for update;
 if not found or institutional_private.entitlement(p_institution_id,p_uid)='null'::jsonb or p_mode not in ('full','revision') then raise exception 'Institutional entitlement unavailable' using errcode='42501'; end if;
 return public.start_mock_attempt(p_uid,p_exam,p_subjects,p_mode,p_questions,true,p_request_id);
end $$;
revoke all on function public.start_institutional_mock(uuid,uuid,text,jsonb,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.start_institutional_mock(uuid,uuid,text,jsonb,text,jsonb,uuid) to service_role;
-- Same simple manual retention regime as P0-A; approval/term/grant history is retained separately.
create or replace function public.prune_institutional_audit() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from institutional_private.audit where occurred_at<clock_timestamp()-interval '180 days';
 delete from public.institutional_license_events where occurred_at<clock_timestamp()-interval '180 days';
 delete from institutional_private.staff_invites where expires_at<clock_timestamp()-interval '30 days';
 delete from institutional_private.invite_limits where bucket<clock_timestamp()-interval '2 days';
 delete from institutional_private.licensing_limits where bucket<clock_timestamp()-interval '2 days';
 delete from institutional_private.learner_codes where expires_at<clock_timestamp()-interval '30 days';
end $$;
revoke all on function institutional_private.licensing_enabled(),institutional_private.licensing_manager(uuid),institutional_private.licensing_command(text,uuid,jsonb),public.institutional_licensing_context(uuid),public.institutional_licensing_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function institutional_private.licensing_enabled(),institutional_private.licensing_manager(uuid),institutional_private.licensing_command(text,uuid,jsonb),public.institutional_licensing_context(uuid),public.institutional_licensing_command(text,uuid,jsonb) to authenticated;
commit;
