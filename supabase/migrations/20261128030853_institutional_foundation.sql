-- P0-A only. No retail backfill, entitlements or production activation.
begin;
create schema institutional_private;
revoke all on schema institutional_private from public, anon;
grant usage on schema institutional_private to authenticated;

create table institutional_private.controls (id boolean primary key default true check(id), enabled boolean not null default false);
insert into institutional_private.controls default values;
create table institutional_private.operators (user_id uuid primary key references auth.users(id), active boolean not null default true);
-- Persistent privacy tombstone: revocation must never republish a learner.
-- No Auth FK: deleting Auth must not expose historic messages. Purge this
-- tombstone only after the approved legacy-content/backup erasure procedure.
create table institutional_private.protected_learners (user_id uuid primary key);

create table public.institutions (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 120),
 active boolean not null default true, created_at timestamptz not null default now()
);
create table public.institution_memberships (
 institution_id uuid not null references public.institutions(id), id uuid not null default gen_random_uuid(),
 user_id uuid not null references auth.users(id), role text not null check(role in ('school_admin','teacher','learner')),
 active boolean not null default true, alias text check(alias ~ '^[A-Za-z0-9_-]{2,40}$'),
 primary key(institution_id,id), unique(institution_id,user_id), unique(institution_id,alias),
 check ((role = 'learner' and (alias is not null or not active)) or (role <> 'learner' and alias is null))
);
create index institutional_member_user on public.institution_memberships(user_id,institution_id);
create table public.school_cohorts (
 institution_id uuid not null references public.institutions(id), id uuid not null default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 100), primary key(institution_id,id)
);
create table public.cohort_memberships (
 institution_id uuid not null, cohort_id uuid not null, membership_id uuid not null,
 primary key(institution_id,cohort_id,membership_id),
 foreign key(institution_id,cohort_id) references public.school_cohorts(institution_id,id),
 foreign key(institution_id,membership_id) references public.institution_memberships(institution_id,id)
);
create index institutional_cohort_member on public.cohort_memberships(institution_id,membership_id,cohort_id);
create table institutional_private.staff_invites (
 institution_id uuid not null references public.institutions(id), id uuid not null default gen_random_uuid(),
 email_hash text not null, token_hash text not null unique, role text not null check(role in ('school_admin','teacher')),
 expires_at timestamptz not null, revoked boolean not null default false, accepted_at timestamptz,
 primary key(institution_id,id)
);
create table institutional_private.audit (
 id uuid primary key default gen_random_uuid(), institution_id uuid references public.institutions(id),
 actor_id uuid, database_actor text not null default session_user, action text not null, target_id uuid, occurred_at timestamptz not null default now()
);
-- Explicit grants; no client DML. All commands are transactional and audited.
do $$ declare t text; begin
 foreach t in array array['institutions','institution_memberships','school_cohorts','cohort_memberships'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['controls','operators','protected_learners','staff_invites','audit'] loop
  execute format('alter table institutional_private.%I enable row level security',t);
  execute format('revoke all on institutional_private.%I from public, anon, authenticated',t);
 end loop;
end $$;

create function institutional_private.enabled() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from institutional_private.controls where enabled)
$$;
create function institutional_private.operator() returns boolean language sql stable security definer set search_path = '' as $$
 select institutional_private.enabled() and exists(select 1 from institutional_private.operators where user_id=auth.uid() and active)
$$;
create function institutional_private.member_role(org uuid) returns text language sql stable security definer set search_path = '' as $$
 select m.role from public.institution_memberships m join public.institutions i on i.id=m.institution_id
 where institutional_private.enabled() and i.active and m.active and m.institution_id=org and m.user_id=auth.uid()
$$;
create function institutional_private.cohort_access(org uuid, cohort uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(institutional_private.member_role(org)='school_admin',false) or
 (institutional_private.member_role(org) is not null and exists(
 select 1 from public.cohort_memberships c join public.institution_memberships m
 on (m.institution_id,m.id)=(c.institution_id,c.membership_id)
 where c.institution_id=org and c.cohort_id=cohort and m.user_id=auth.uid() and m.active))
$$;
create function institutional_private.member_visible(org uuid, member uuid, uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select institutional_private.member_role(org) is not null and (
 uid=auth.uid() or institutional_private.member_role(org)='school_admin' or
 (institutional_private.member_role(org)='teacher' and exists(
 select 1 from public.cohort_memberships c where c.institution_id=org and c.membership_id=member
 and institutional_private.cohort_access(org,c.cohort_id))))
$$;
create policy institution_read on public.institutions for select to authenticated using (institutional_private.member_role(id) is not null);
create policy membership_read on public.institution_memberships for select to authenticated using (institutional_private.member_visible(institution_id,id,user_id));
create policy cohort_read on public.school_cohorts for select to authenticated using (institutional_private.cohort_access(institution_id,id));
create policy cohort_membership_read on public.cohort_memberships for select to authenticated using (
 institutional_private.cohort_access(institution_id,cohort_id) and
 (institutional_private.member_role(institution_id) in ('teacher','school_admin') or exists(
 select 1 from public.institution_memberships m where m.institution_id=cohort_memberships.institution_id
 and m.id=cohort_memberships.membership_id and m.user_id=auth.uid())));

create function institutional_private.immutable_links() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.institution_id is distinct from old.institution_id or
 (to_jsonb(new)->'id') is distinct from (to_jsonb(old)->'id') or
 (to_jsonb(new)->'user_id') is distinct from (to_jsonb(old)->'user_id') or
 (to_jsonb(new)->'role') is distinct from (to_jsonb(old)->'role') or
 (to_jsonb(new)->'cohort_id') is distinct from (to_jsonb(old)->'cohort_id') or
 (to_jsonb(new)->'membership_id') is distinct from (to_jsonb(old)->'membership_id') then
 raise exception 'Immutable institutional link' using errcode='42501'; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['institution_memberships','school_cohorts','cohort_memberships'] loop
 execute format('create trigger immutable_links before update on public.%I for each row execute function institutional_private.immutable_links()',t);
 end loop;
end $$;

-- Commands serialize per institution, including invitation acceptance and revocation.
-- Definer is deliberately private; the public RPC is an invoker wrapper.
create function institutional_private.command(p_action text,p_institution_id uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); org uuid := p_institution_id; target uuid;
 op boolean; role_name text; token text; invite institutional_private.staff_invites%rowtype;
 member public.institution_memberships%rowtype; result jsonb := '{}'::jsonb;
begin
 if actor is null or not institutional_private.enabled() then raise exception 'Institutional access unavailable' using errcode='42501'; end if;
 op := institutional_private.operator();
 if p_action='create_institution' then
  if not op then raise exception 'Forbidden' using errcode='42501'; end if;
  insert into public.institutions(name) values(p_payload->>'name') returning id into org;
  result := jsonb_build_object('institution_id',org);
 else
  perform 1 from public.institutions where id=org and active for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  role_name := institutional_private.member_role(org);
  if p_action='accept_invite' then
   select * into invite from institutional_private.staff_invites where institution_id=org
    and token_hash=encode(sha256(convert_to(p_payload->>'token','UTF8')),'hex') for update;
   if not found or invite.revoked or invite.accepted_at is not null or invite.expires_at<=now() or
    not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null
    and encode(sha256(convert_to(lower(email),'UTF8')),'hex')=invite.email_hash) or
    exists(select 1 from institutional_private.protected_learners where user_id=actor) then
    raise exception 'Invalid invitation' using errcode='42501'; end if;
   insert into public.institution_memberships(institution_id,user_id,role) values(org,actor,invite.role) returning id into target;
   update institutional_private.staff_invites set accepted_at=now() where institution_id=org and id=invite.id;
  elsif p_action='withdraw' then
   select * into member from public.institution_memberships where institution_id=org and user_id=actor and active;
   if not found or member.role<>'learner' then raise exception 'Forbidden' using errcode='42501'; end if;
   target:=member.id;
   delete from public.cohort_memberships where institution_id=org and membership_id=target;
   update public.institution_memberships set active=false,alias=null where institution_id=org and id=target;
  else
   if not op and role_name is distinct from 'school_admin' then raise exception 'Forbidden' using errcode='42501'; end if;
   case p_action
   when 'create_cohort' then
    insert into public.school_cohorts(institution_id,name) values(org,p_payload->>'name') returning id into target;
   when 'invite_staff' then
    if p_payload->>'role' not in ('school_admin','teacher') or (p_payload->>'role'='school_admin' and not op)
     or length(p_payload->>'email')>254 or (p_payload->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
     raise exception 'Invalid invite' using errcode='22023'; end if;
    token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    insert into institutional_private.staff_invites(institution_id,email_hash,token_hash,role,expires_at)
    values(org,encode(sha256(convert_to(lower(p_payload->>'email'),'UTF8')),'hex'),encode(sha256(convert_to(token,'UTF8')),'hex'),p_payload->>'role',now()+interval '48 hours') returning id into target;
    result:=jsonb_build_object('token',token,'expires_in_hours',48);
   when 'revoke_invite' then
    update institutional_private.staff_invites set revoked=true where institution_id=org and id=(p_payload->>'id')::uuid
     and (op or role='teacher') returning id into target;
    if not found then raise exception 'Forbidden' using errcode='42501'; end if;
   when 'revoke_member' then
    update public.institution_memberships set active=false where institution_id=org and id=(p_payload->>'id')::uuid
     and (op or role in ('teacher','learner')) returning id into target;
    if not found then raise exception 'Forbidden' using errcode='42501'; end if;
   when 'assign_cohort' then
    select * into member from public.institution_memberships where institution_id=org and id=(p_payload->>'membership_id')::uuid and active;
    if not found or member.role not in ('teacher','learner') then raise exception 'Forbidden' using errcode='42501'; end if;
    insert into public.cohort_memberships values(org,(p_payload->>'cohort_id')::uuid,member.id) on conflict do nothing;
    target:=member.id;
   when 'remove_from_cohort' then
    delete from public.cohort_memberships where institution_id=org and cohort_id=(p_payload->>'cohort_id')::uuid and membership_id=(p_payload->>'membership_id')::uuid returning membership_id into target;
   when 'enroll_learner' then
    -- Operator verifies the school's account ownership/notice before this operation.
    if not op then raise exception 'Forbidden' using errcode='42501'; end if;
    if not exists(select 1 from auth.users where id=(p_payload->>'user_id')::uuid) or
      exists(select 1 from public.users where id=p_payload->>'user_id' and data->>'role'='admin') or
      exists(select 1 from institutional_private.operators where user_id=(p_payload->>'user_id')::uuid) or
      exists(select 1 from public.institution_memberships where user_id=(p_payload->>'user_id')::uuid and role<>'learner') then
      raise exception 'Account cannot be enrolled' using errcode='42501'; end if;
    insert into institutional_private.protected_learners values((p_payload->>'user_id')::uuid) on conflict do nothing;
    insert into public.institution_memberships(institution_id,user_id,role,alias) values(org,(p_payload->>'user_id')::uuid,'learner',p_payload->>'alias') returning id into target;
   when 'delete_learner_membership' then
    select * into member from public.institution_memberships where institution_id=org and id=(p_payload->>'id')::uuid and role='learner' and not active;
    if not found then raise exception 'Revoke first' using errcode='42501'; end if;
    target:=member.id;
    delete from public.cohort_memberships where institution_id=org and membership_id=target;
    delete from public.institution_memberships where institution_id=org and id=target;
   when 'deactivate_institution' then
    if not op then raise exception 'Forbidden' using errcode='42501'; end if;
    update public.institutions set active=false where id=org;
   else raise exception 'Unknown command' using errcode='22023';
   end case;
  end if;
 end if;
 insert into institutional_private.audit(institution_id,actor_id,action,target_id) values(org,actor,p_action,target);
 return result || jsonb_build_object('id',target);
end $$;
create function public.institutional_command(p_action text,p_institution_id uuid,p_payload jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as $$
 select institutional_private.command(p_action,p_institution_id,p_payload)
$$;

-- No client-editable profile flag: this is based on a persistent protected registry.
create function institutional_private.protected(uid text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from institutional_private.protected_learners where user_id::text=uid)
$$;
create function public.institutional_learner_guard(p_uid text) returns boolean language sql stable security definer set search_path = '' as $$
 select institutional_private.protected(p_uid)
$$;
revoke all on function public.institutional_learner_guard(text) from public,anon,authenticated;
grant execute on function public.institutional_learner_guard(text) to service_role;

create or replace view public.public_profiles with (security_barrier=true) as
select id,parent_id,version,created_at,updated_at,
 jsonb_build_object('displayName',data->'displayName','photoURL',data->'photoURL','schoolName',data->'schoolName',
 'xp',data->'xp','streak',data->'streak','isOnline',data->'isOnline','equippedFrame',data->'equippedFrame','equippedTitle',data->'equippedTitle') as data
from public.users where auth.uid() is not null and not institutional_private.protected(id)
 and not institutional_private.protected(auth.uid()::text);

create function institutional_private.safe_conversation(doc jsonb) returns boolean language sql stable security definer set search_path = '' as $$
 select not institutional_private.protected(auth.uid()::text) and not exists(
 select 1 from institutional_private.protected_learners p where coalesce(doc->'participants','[]'::jsonb) @> to_jsonb(p.user_id::text))
$$;
create function institutional_private.safe_thread(thread text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.conversations where id=thread and institutional_private.safe_conversation(data))
$$;
create policy institutional_conversations on public.conversations as restrictive for all to authenticated
 using(institutional_private.safe_conversation(data)) with check(institutional_private.safe_conversation(data));
create policy institutional_messages on public.messages as restrictive for all to authenticated
 using(institutional_private.safe_thread(parent_id) and not institutional_private.protected(data->>'senderId'))
 with check(institutional_private.safe_thread(parent_id) and not institutional_private.protected(data->>'senderId'));
create policy institutional_challenges on public.challenges as restrictive for all to authenticated
 using(not institutional_private.protected(auth.uid()::text)) with check(not institutional_private.protected(auth.uid()::text));
create policy institutional_results on public.challenge_results as restrictive for all to authenticated
 using(not institutional_private.protected(auth.uid()::text) and not institutional_private.protected(data->>'userId'))
 with check(not institutional_private.protected(auth.uid()::text));

-- Owner-only operator changes are audited, including removal. No API can promote an operator.
create function institutional_private.audit_operator() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into institutional_private.audit(actor_id,action,target_id) values(auth.uid(),'operator_'||lower(tg_op),coalesce(new.user_id,old.user_id));
 return coalesce(new,old);
end $$;
create trigger operator_audit after insert or update or delete on institutional_private.operators for each row execute function institutional_private.audit_operator();
-- Existing users/admins cannot acquire institutional privileges through their profile.
revoke all on all functions in schema institutional_private from public,anon,authenticated;
grant execute on function institutional_private.enabled(), institutional_private.operator(), institutional_private.member_role(uuid),
 institutional_private.cohort_access(uuid,uuid),institutional_private.member_visible(uuid,uuid,uuid),
 institutional_private.protected(text),institutional_private.safe_conversation(jsonb),institutional_private.safe_thread(text),
 institutional_private.command(text,uuid,jsonb) to authenticated;
revoke all on function public.institutional_command(text,uuid,jsonb) from public,anon;
grant execute on function public.institutional_command(text,uuid,jsonb) to authenticated;
commit;
