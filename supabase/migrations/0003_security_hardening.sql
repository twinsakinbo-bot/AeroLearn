-- Security corrections for the document store. Apply after 0002 on a staged database first.
-- No existing rows are deleted or rewritten.

-- Profiles contain email, receipts and payment state in a single JSON value.
-- Only the owner and admins may read that value. A separate projected view
-- preserves community, messaging and leaderboard discovery without those fields.
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid())::text or public.is_admin());

drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert to authenticated
  with check (
    public.is_admin() or (
      id = (select auth.uid())::text
      and data ->> 'role' = 'student'
      and data ->> 'subscription' = 'free'
      and (data -> 'proExpiresAt') is null
      and (data -> 'trustPassRequestId') is null
    )
  );

-- The redemption function uses a transaction-local marker. Other client writes
-- cannot change privileged fields or reset the one-time Trust Pass marker.
create or replace function public.guard_user_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if coalesce(current_setting('aerolearn.redeeming', true), '') = '1' then return new; end if;
  if (new.data -> 'role') is distinct from (old.data -> 'role')
    or (new.data -> 'subscription') is distinct from (old.data -> 'subscription')
    or (new.data -> 'proExpiresAt') is distinct from (old.data -> 'proExpiresAt')
    or (new.data -> 'trustPassRequestId') is distinct from (old.data -> 'trustPassRequestId')
  then
    raise exception 'Plan and role fields are server-managed' using errcode = '42501';
  end if;
  return new;
end $$;

-- PostgreSQL views run with the owner's rights unless security_invoker is set.
-- This is deliberate here: the view exposes exactly the six public profile
-- fields below and only to an authenticated user, while users.data stays private.
create or replace view public.public_profiles with (security_barrier = true) as
select id, parent_id, version, created_at, updated_at,
  jsonb_build_object(
    'displayName', data -> 'displayName',
    'photoURL', data -> 'photoURL',
    'schoolName', data -> 'schoolName',
    'xp', data -> 'xp',
    'streak', data -> 'streak',
    'isOnline', data -> 'isOnline',
    'equippedFrame', data -> 'equippedFrame',
    'equippedTitle', data -> 'equippedTitle'
  ) as data
from public.users
where (select auth.uid()) is not null;
revoke all on public.public_profiles from public, anon;
grant select on public.public_profiles to authenticated;

-- A group member cannot make themselves an admin, add an outsider, or turn a
-- direct thread into a group. The leave endpoint uses the service role.
create or replace function public.guard_conversation_membership()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.data -> 'type' is distinct from old.data -> 'type' then
    raise exception 'Conversation type is immutable' using errcode = '42501';
  end if;
  if new.data -> 'participants' is distinct from old.data -> 'participants'
    or new.data -> 'admins' is distinct from old.data -> 'admins' then
    if old.data ->> 'type' is distinct from 'group'
      or not (old.data -> 'admins' @> to_jsonb(auth.uid()::text)) then
      raise exception 'Only group admins can change membership' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists conversations_membership_guard on public.conversations;
create trigger conversations_membership_guard before update on public.conversations
  for each row execute function public.guard_conversation_membership();

-- Chat content is append-only for students. Bot replies are inserted by the
-- AI route with its service role after it verifies the thread membership.
drop policy if exists messages_update on public.messages;
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (public.in_conversation(parent_id) and data ->> 'senderId' = (select auth.uid())::text);
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using (public.in_conversation(parent_id) and data ->> 'senderId' = (select auth.uid())::text);

create or replace function public.doc_table_ok(p_table text)
returns boolean language sql immutable as $$
  select p_table = any (array[
    'users', 'public_profiles', 'lessons', 'practice_questions', 'conversations',
    'messages', 'challenges', 'challenge_results', 'verification_requests',
    'quiz_results', 'homework', 'homework_submissions', 'notes', 'reports', 'settings'
  ]);
$$;

-- A receipt is always created pending by its owner. Review state belongs to admins.
drop policy if exists verification_insert on public.verification_requests;
create policy verification_insert on public.verification_requests for insert to authenticated
  with check (data ->> 'userId' = (select auth.uid())::text and data ->> 'status' = 'pending');

-- Storage enforces these even if a caller bypasses the browser's file picker.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
where id = 'receipts';

-- Students cannot remove evidence while a transfer is awaiting review.
drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_admin());

-- Used by the authenticated RPC. The original queried a nonexistent email
-- column on public.users, so every successful code claim rolled back.
create or replace function public.redeem_licence_code(
  p_key text,   -- normalised (upper-case, no dashes) code text
  p_uid text
)
returns table (
  status        text,
  plan_id       text,
  expires_at    timestamptz,
  extended_from timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      text;
  v_row     public.licence_codes%rowtype;
  v_current timestamptz;
  v_days    int;
  v_new_exp timestamptz;
  v_email   text;
begin
  -- Defence in depth: the route verifies the id token, but this function is
  -- granted to `authenticated`, so it must not take the caller's word for who
  -- they are. A definer function that trusts p_uid is a way to gift someone else
  -- a redemption.
  if auth.uid() is null or auth.uid()::text <> p_uid then
    raise exception 'redeem_licence_code must be called by the signed-in user'
      using errcode = '42501';
  end if;

  if p_key is null or char_length(p_key) <> 14 then
    return query select 'malformed'::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- Tell guard_user_fields() this write is authorised. `is_local => true` scopes
  -- it to the current transaction, and a client has no channel to set
  -- `aerolearn.*` — PostgREST does not expose arbitrary GUCs, and even if one
  -- leaked in it would be reset at commit.
  perform set_config('aerolearn.redeeming', '1', true);

  v_id := encode(digest(upper(p_key), 'sha256'), 'hex');

  -- Atomic claim: the winner gets the row, everyone else gets zero rows. There is
  -- no read-then-write window for a concurrent redemption to slip through.
  update public.licence_codes
     set status      = 'used',
         redeemed_by = p_uid,
         redeemed_at = now(),
         updated_at  = now()
   where id = v_id
     and status = 'available'
   returning * into v_row;

  if v_row.id is null then
    -- Distinguish the cases so the UI can be honest about which one happened.
    -- Telling a student "already redeemed" is a deliberate trade: it costs an
    -- attacker nothing (a used code is worthless to them, and the alphabet makes
    -- an unused one unguessable), but it is exactly what a student who was sold a
    -- recycled code needs in order to prove it.
    select * into v_row from public.licence_codes where id = v_id;
    if v_row.id is null then
      return query select 'not_found'::text, null::text, null::timestamptz, null::timestamptz;
    elsif v_row.status = 'cancelled' then
      return query select 'cancelled'::text, v_row.plan_id, null::timestamptz, v_row.expires_granted;
    else
      return query select 'used'::text, v_row.plan_id, v_row.expires_granted, null::timestamptz;
    end if;
    return;
  end if;

  -- Grant the access, extending rather than shortening. A student who redeems a
  -- second term with 20 days left gets those 20 days plus a new term; the same
  -- rule the manual queue follows, so the two paths cannot disagree.
  select to_timestamp((u.data -> 'proExpiresAt' -> '__ts' ->> 's')::bigint)
    into v_current
  from public.users u
  where u.id = p_uid
    and jsonb_typeof(u.data -> 'proExpiresAt') = 'object';

  select days into v_days from public.plan_durations where plan = v_row.plan_id;

  if v_days is null then
    -- Unknown plan id: a code was minted for something no longer priced. Grant a
  -- month rather than taking access away — the student is not at fault.
    v_days := 30;
  end if;

  if v_days < 0 then
    v_new_exp := null;                 -- lifetime: isProUser reads null as permanent
  else
    v_new_exp := greatest(coalesce(v_current, now()), now())
                 + make_interval(days => v_days);
  end if;

  select data ->> 'email' into v_email from public.users where id = p_uid;

  update public.users
     set data = jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      data,
                      '{subscription}',
                      to_jsonb(v_row.plan_id)
                    ),
                    '{proExpiresAt}',
                    case
                      when v_new_exp is null then 'null'::jsonb
                      else jsonb_build_object('__ts', jsonb_build_object(
                        's', floor(extract(epoch from v_new_exp))::bigint, 'n', 0))
                    end
                  ),
                  '{licenceRedeemedAt}',
                  jsonb_build_object('__ts', jsonb_build_object(
                    's', floor(extract(epoch from now()))::bigint, 'n', 0))
                )
   where id = p_uid;

  -- Audit trail: what this code granted, to whom.
  update public.licence_codes
     set expires_granted = v_new_exp,
         redeemed_email  = v_email
   where id = v_row.id;

  return query select 'ok'::text, v_row.plan_id, v_new_exp, v_current;
end
$$;

-- One atomic counter shared across all function instances. Only the server's
-- service role can call it after verifying the user's access token.
create table if not exists public.api_rate_limits (
  uid text not null,
  bucket text not null,
  hits integer not null default 0,
  reset_at timestamptz not null,
  primary key (uid, bucket)
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;

create or replace function public.take_api_rate_limit(p_uid text, p_bucket text, p_max integer, p_window_seconds integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_hits integer; v_reset timestamptz;
begin
  if p_uid is null or length(p_uid) > 100 or p_bucket is null or length(p_bucket) > 80
    or p_max < 1 or p_max > 1000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit arguments' using errcode = '22023';
  end if;
  insert into public.api_rate_limits (uid, bucket, hits, reset_at)
  values (p_uid, p_bucket, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (uid, bucket) do update
    set hits = case when api_rate_limits.reset_at <= now() then 1 else api_rate_limits.hits + 1 end,
        reset_at = case when api_rate_limits.reset_at <= now()
          then now() + make_interval(secs => p_window_seconds) else api_rate_limits.reset_at end
  returning hits, reset_at into v_hits, v_reset;
  if v_hits <= p_max then return 0; end if;
  return greatest(1, ceil(extract(epoch from (v_reset - now())))::integer);
end $$;
revoke all on function public.take_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_api_rate_limit(text, text, integer, integer) to service_role;

-- Daily free-plan generation quotas, counted by Nigeria's calendar day.
create table if not exists public.api_daily_usage (
  uid text not null,
  bucket text not null,
  day date not null,
  used integer not null default 0,
  primary key (uid, bucket, day)
);
alter table public.api_daily_usage enable row level security;
revoke all on public.api_daily_usage from public, anon, authenticated;

create or replace function public.take_daily_quota(p_uid text, p_bucket text, p_max integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_used integer;
begin
  if p_uid is null or length(p_uid) > 100 or p_bucket not in ('practice', 'flashcards')
    or p_max < 1 or p_max > 100 then
    raise exception 'Invalid quota arguments' using errcode = '22023';
  end if;
  insert into public.api_daily_usage (uid, bucket, day, used)
  values (p_uid, p_bucket, (now() at time zone 'Africa/Lagos')::date, 1)
  on conflict (uid, bucket, day) do update set used = api_daily_usage.used + 1
    where api_daily_usage.used < p_max
  returning used into v_used;
  return v_used;
end $$;
revoke all on function public.take_daily_quota(text, text, integer) from public, anon, authenticated;
grant execute on function public.take_daily_quota(text, text, integer) to service_role;

create or replace function public.daily_quota_used(p_uid text, p_bucket text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select used from public.api_daily_usage
    where uid = p_uid and bucket = p_bucket
      and day = (now() at time zone 'Africa/Lagos')::date), 0);
$$;
revoke all on function public.daily_quota_used(text, text) from public, anon, authenticated;
grant execute on function public.daily_quota_used(text, text) to service_role;

-- Challenge results and wallet awards must be written together. One stable id
-- per student/challenge makes duplicate submissions harmless under concurrency.
drop policy if exists challenge_results_insert on public.challenge_results;
drop policy if exists challenge_results_write on public.challenge_results;

create or replace function public.claim_challenge_reward(
  p_uid text, p_challenge text, p_score integer, p_total integer,
  p_time integer, p_coins integer, p_name text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if p_uid is null or p_challenge is null or p_score < 0 or p_total < 1
    or p_score > p_total or p_total > 40 or p_time < 1 or p_time > 3600
    or p_coins < 0 or p_coins > 100 then
    raise exception 'Invalid challenge result' using errcode = '22023';
  end if;
  insert into public.challenge_results (id, data)
  values (p_uid || ':' || p_challenge, jsonb_build_object(
    'userId', p_uid, 'challengeId', p_challenge, 'displayName', left(p_name, 100),
    'score', p_score, 'totalQuestions', p_total, 'timeTaken', p_time,
    'coinsEarned', p_coins,
    'createdAt', jsonb_build_object('__ts', jsonb_build_object('s', floor(extract(epoch from now()))::bigint, 'n', 0))
  )) on conflict (id) do nothing returning id into v_id;
  if v_id is null then return false; end if;
  update public.users set data = jsonb_set(data, '{coins}',
    to_jsonb(coalesce((data ->> 'coins')::integer, 0) + p_coins))
    where id = p_uid;
  if not found then raise exception 'Student not found' using errcode = '22023'; end if;
  return true;
end $$;
revoke all on function public.claim_challenge_reward(text, text, integer, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.claim_challenge_reward(text, text, integer, integer, integer, integer, text)
  to service_role;

-- Bank transfers are manually verified by an administrator. Once approved,
-- update the plan and receipt together, with locks to prevent double approval.
create or replace function public.approve_pending_receipt(p_request_id text, p_user_id text, p_reviewer_id text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_receipt public.verification_requests%rowtype;
v_user public.users%rowtype;
v_plan text; v_days integer; v_current timestamptz; v_expiry timestamptz;
begin
  if p_request_id is null or p_user_id is null or p_reviewer_id is null then
    raise exception 'Missing approval identity' using errcode = '22023';
  end if;
  select * into v_receipt from public.verification_requests where id = p_request_id for update;
  if not found or v_receipt.data ->> 'status' is distinct from 'pending'
    or v_receipt.data ->> 'userId' is distinct from p_user_id then
    raise exception 'Receipt is not pending for this student' using errcode = '22023';
  end if;
  select * into v_user from public.users where id = p_user_id for update;
  if not found or v_user.data ->> 'role' = 'admin' then
    raise exception 'Student not found' using errcode = '22023';
  end if;
  v_plan := v_receipt.data ->> 'planId';
  select days into v_days from public.plan_durations where plan = v_plan;
  if not found then raise exception 'Unknown plan' using errcode = '22023'; end if;
  if v_user.data ->> 'subscription' = 'lifetime' and v_plan <> 'lifetime' then
    raise exception 'Lifetime access cannot be shortened' using errcode = '22023';
  end if;
  if jsonb_typeof(v_user.data -> 'proExpiresAt') = 'object' then
    v_current := to_timestamp((v_user.data #>> '{proExpiresAt,__ts,s}')::bigint);
  end if;
  v_expiry := case when v_days < 0 then null
    else greatest(coalesce(v_current, now()), now()) + make_interval(days => v_days) end;
  update public.users set data = v_user.data || jsonb_build_object(
    'subscription', v_plan,
    'proExpiresAt', case when v_expiry is null then 'null'::jsonb
      else jsonb_build_object('__ts', jsonb_build_object('s', floor(extract(epoch from v_expiry))::bigint, 'n', 0)) end,
    'pendingPlan', null, 'pendingSince', null, 'trustPassRequestId', null,
    'planExpiryReminderFor', null, 'planEndedNotifiedFor', null, 'lastExpiredPlan', null
  ) where id = p_user_id;
  update public.verification_requests set data = v_receipt.data || jsonb_build_object(
    'status', 'approved', 'reviewedAt', jsonb_build_object('__ts', jsonb_build_object('s', floor(extract(epoch from now()))::bigint, 'n', 0)),
    'reviewedBy', p_reviewer_id
  ) where id = p_request_id;
  return v_expiry;
end $$;
revoke all on function public.approve_pending_receipt(text, text, text) from public, anon, authenticated;
grant execute on function public.approve_pending_receipt(text, text, text) to service_role;

