-- =============================================================================
-- 0002 — Prepaid licence codes: the sales channel that needs no payment processor
--
-- WHY THIS EXISTS
--
-- Pro is sold by bank transfer, verified by hand. That works, but every sale
-- passes through one person reading one screenshot, and the only entity that can
-- sell AeroLearn is the site itself. A prepaid code fixes both: codes are minted
-- in batches, handed to a reseller / school / sponsor, and THEY collect the money
-- and pass on the code. Redemption grants access instantly — no receipt, no queue,
-- and no merchant account anywhere in the loop.
--
--
-- THE SECURITY MODEL, IN ONE PARAGRAPH
--
-- The plaintext code is never stored. `id` is the SHA-256 of the normalised code,
-- so a full table read yields not one usable code. Redemption is a single
-- `UPDATE ... WHERE status = 'available' ... RETURNING` inside a SECURITY DEFINER
-- function, so two people submitting the same code cannot both win — that race is
-- closed in SQL, where it counts, rather than in application code where a
-- read-then-write would leave it open. Definer rights are required because the
-- caller must not be able to touch the table at all: the table is revoked from
-- `anon`/`authenticated`, and the function is the only door.
--
-- HASH NORMALISATION MUST MATCH lib/licences.ts exactly: upper-case, dashes and
-- spaces stripped. `AL-1234-5678-JKMN` hashes as `AL12345678JKMN`. The route
-- normalises before calling, and `upper()` here is a second line of defence, not
-- the mechanism. If either side changes, every existing code silently stops
-- working — so both are commented and the round trip is asserted in
-- scripts/verify-licence-codes.sql.
--
--
-- NOTE ON THE TABLE SHAPE
--
-- `licence_codes` deliberately does NOT follow 0001's `data jsonb` convention.
-- Codes are money-like and need real constraints: a primary key on the hash, a
-- check constraint on status, partial indexes. Forcing those into jsonb would
-- pretend they are not queryable. It is also NOT added to `doc_table_ok()`, so
-- nothing can reach it through the Firestore-shaped client.
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.licence_codes (
  id              text primary key,            -- sha256(normalised code), hex
  plan_id         text        not null,
  status          text        not null default 'available'
                    check (status in ('available', 'used', 'cancelled')),
  batch_id        text,                        -- one mint = one batch, for audit
  channel         text,                        -- 'reseller' | 'school' | 'sponsor' | 'direct'
  buyer_note      text,                        -- who it was sold to, free text
  redeemed_by     text,                        -- uid
  redeemed_email  text,
  redeemed_at     timestamptz,
  expires_granted timestamptz,                 -- what this code bought, for support
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists licence_codes_status_idx on public.licence_codes (status)
  where status = 'available';
create index if not exists licence_codes_batch_idx  on public.licence_codes (batch_id, created_at desc);
create index if not exists licence_codes_user_idx   on public.licence_codes (redeemed_by)
  where redeemed_by is not null;

alter table public.licence_codes enable row level security;
-- The owner bypasses RLS without FORCE; this table should be reachable by the
-- service role and by exactly one definer function.
alter table public.licence_codes force row level security;

revoke all on public.licence_codes from anon, authenticated;

comment on table public.licence_codes is
  'Prepaid Pro codes. id is sha256 of the normalised code — the plaintext is never stored.';
comment on column public.licence_codes.buyer_note is
  'Who the batch was sold to. Free text, for reconciling a disputed code.';

-- ---------------------------------------------------------- plan durations
-- Denormalised into the database on purpose. A code sold under plan X must keep
-- granting X days even after the price list is edited, so the duration a customer
-- was promised is data the code depends on — not application config that can be
-- changed under their feet.
create table if not exists public.plan_durations (
  plan text primary key,
  days int not null
);

-- days < 0 is the "never expires" sentinel, because a null column here would be
-- ambiguous with "plan not found". Keep in step with `days` in lib/plans.ts.
insert into public.plan_durations (plan, days) values
  ('weekly',      7),
  ('monthly',     30),
  ('term',        90),
  ('annual',      365),
  ('jamb_sprint', 42),
  ('waec_final',  70),
  ('jamb_waec',   210),
  ('lifetime',    -1),
  ('pro',         30)    -- legacy: the old approve button wrote this for every plan
on conflict (plan) do update set days = excluded.days;

alter table public.plan_durations enable row level security;
alter table public.plan_durations force row level security;
revoke all on public.plan_durations from anon, authenticated;

-- The route reads durations through the service role; no client policy is needed.

-- ------------------------------------------------------------------ the door
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

  select email into v_email from public.users where id = p_uid;

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

comment on function public.redeem_licence_code(text, text) is
  'Sole redemption path for prepaid codes. Atomically claims the code and extends the caller subscription.';

revoke all on function public.redeem_licence_code(text, text) from public;
grant execute on function public.redeem_licence_code(text, text) to authenticated;

-- ------------------------------------------------------- relax the guard once
-- 0001's guard_user_fields() blocks a student from changing their own
-- subscription. Correct, and it stays — with one narrow exception for the
-- function above, which runs as the student by design.
create or replace function public.guard_user_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if coalesce(current_setting('aerolearn.redeeming', true), '') = '1' then
    return new;
  end if;

  if coalesce(new.data ->> 'role', '') is distinct from coalesce(old.data ->> 'role', '')
     or coalesce(new.data ->> 'subscription', '') is distinct from coalesce(old.data ->> 'subscription', '')
     or coalesce(new.data ->> 'proExpiresAt', '') is distinct from coalesce(old.data ->> 'proExpiresAt', '')
  then
    raise exception 'role, subscription and proExpiresAt are server-managed';
  end if;
  return new;
end
$$;

-- ------------------------------------------------------------------ receipts
-- A school or sponsor paying one invoice for 40 students is a second manual
-- queue entry, which is the bottleneck codes were meant to remove. `sale_notes`
-- lets the seller log the transfer against a batch, so money can be reconciled
-- without a verification request per code.
create table if not exists public.licence_batches (
  id          text primary key,
  plan_id     text not null,
  quantity    int  not null,
  channel     text,
  buyer_note  text,
  contact     text,                        -- reseller WhatsApp/email, for disputes
  amount_due  numeric(12,2),
  settled     boolean not null default false,
  settled_at  timestamptz,
  created_by  text,
  created_at  timestamptz not null default now()
);

alter table public.licence_batches enable row level security;
alter table public.licence_batches force row level security;
revoke all on public.licence_batches from anon, authenticated;

comment on table public.licence_batches is
  'One row per mint: who the codes went to and whether they have been paid for.';
