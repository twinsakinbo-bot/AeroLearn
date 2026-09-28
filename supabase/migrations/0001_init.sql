-- ============================================================================
-- AeroLearn — Supabase schema (replaces Firestore)
--
-- Run this once in the Supabase SQL editor. See SUPABASE_SETUP.md.
--
-- Every former Firestore collection is a table of the same shape:
--
--   id text primary key, parent_id text, data jsonb, version bigint, ...
--
-- so document shapes carry over byte-for-byte and the app's ~300 existing
-- queries keep working through lib/db.ts. Row-level security below is a direct
-- port of firestore.rules — same collections, same conditions, same admin
-- escape hatch — so the migration does not quietly widen access.
--
-- Idempotent: safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- is_admin()
-- SECURITY DEFINER on purpose. The policies on `users` call this, and a plain
-- function would re-enter those same policies to read the role — an infinite
-- recursion Postgres reports as "stack depth limit exceeded". Definer rights
-- read the row once, outside RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select data->>'role' = 'admin' from public.users where id = auth.uid()::text),
    false
  );
$$;

comment on function public.is_admin() is
  'Ports isAdmin() from firestore.rules: users/{uid}.role == "admin".';

-- ------------------------------------------------------- comparable jsonb keys
-- `data->>''xp''` is text, so ordering by it puts 9 after 10 and range filters on
-- dates compare character by character. These two project a jsonb scalar into
-- exactly one comparable domain and NULL in the other, so ORDER BY can list
-- both and let the non-null one decide. Exact — no zero-padding, no
-- negative-number edge case.

create or replace function public.doc_num(v jsonb)
returns numeric
language sql
immutable
as $$
  select case
    when v is null or jsonb_typeof(v) = 'null' then null
    when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when jsonb_typeof(v) = 'boolean' then case when v = 'true'::jsonb then 1 else 0 end
    -- timestamp marker written by lib/supabase/documents.ts
    when jsonb_typeof(v) = 'object' and v ? '__ts'
      then coalesce((v #>> '{__ts,s}')::numeric, 0)
         + coalesce((v #>> '{__ts,n}')::numeric, 0) / 1000000000
    else null
  end;
$$;

create or replace function public.doc_txt(v jsonb)
returns text
language sql
immutable
as $$
  select case
    when v is null or jsonb_typeof(v) = 'null' then null
    when jsonb_typeof(v) = 'string' then v #>> '{}'
    when jsonb_typeof(v) in ('number', 'boolean') then null
    when jsonb_typeof(v) = 'object' and v ? '__ts' then null
    else v::text
  end;
$$;

-- =============================================================================
-- Tables
--
-- All 14 share one shape, so they are created in a loop: hand-writing them
-- would be 14 chances to let one drift. `parent_id` is only used by `messages`
-- (the one Firestore subcollection); it stays null everywhere else.
--
-- `version` backs optimistic concurrency for runTransaction() — a transaction
-- asserts the version it read and retries when another writer got there first.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'lessons', 'practice_questions', 'conversations', 'messages',
    'challenges', 'challenge_results', 'verification_requests', 'quiz_results',
    'homework', 'homework_submissions', 'notes', 'reports', 'settings'
  ]
  loop
    execute format($f$
      create table if not exists public.%I (
        id         text primary key default gen_random_uuid()::text,
        parent_id  text,
        data       jsonb not null default '{}'::jsonb,
        version    bigint not null default 1,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table public.%I enable row level security;
      create index if not exists %I on public.%I using gin (data jsonb_path_ops);
      create index if not exists %I on public.%I (parent_id);
      create index if not exists %I on public.%I (created_at desc);
    $f$, t, t, t || '_data_gin', t, t || '_parent_idx', t, t || '_created_idx', t);
  end loop;
end
$$;

-- Messages belong to a conversation; deleting the conversation clears them.
alter table public.messages
  drop constraint if exists messages_parent_fk;
alter table public.messages
  add constraint messages_parent_fk
  foreign key (parent_id) references public.conversations (id) on delete cascade;

-- Hot paths that the GIN index cannot serve as cheaply.
create index if not exists users_xp_idx on public.users (public.doc_num(data -> 'xp') desc);
create index if not exists users_role_idx on public.users ((data ->> 'role'));
create index if not exists questions_subject_idx on public.practice_questions ((data ->> 'subject'));
create index if not exists lessons_published_idx on public.lessons ((data ->> 'isPublished'));
create index if not exists submissions_student_idx on public.homework_submissions ((data ->> 'studentId'));
create index if not exists quiz_results_user_idx on public.quiz_results ((data ->> 'userId'));

-- =============================================================================
-- Triggers
-- =============================================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'lessons', 'practice_questions', 'conversations', 'messages',
    'challenges', 'challenge_results', 'verification_requests', 'quiz_results',
    'homework', 'homework_submissions', 'notes', 'reports', 'settings'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch', t
    );
  end loop;
end
$$;

-- ------------------------------------------------- profile row for every signup
-- Firebase left profile creation to the client, which meant a signup that
-- crashed between createUser and setDoc left an account with no profile. Doing
-- it in a trigger makes the two atomic.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, data)
  values (
    new.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'uid', new.id::text,
      'email', new.email,
      'displayName', coalesce(new.raw_user_meta_data ->> 'full_name',
                              new.raw_user_meta_data ->> 'name',
                              split_part(coalesce(new.email, ''), '@', 1)),
      'photoURL', new.raw_user_meta_data ->> 'avatar_url',
      'role', 'student',
      'subscription', 'free',
      'xp', 0,
      'coins', 0,
      'streak', 0,
      'completedLessons', '[]'::jsonb,
      'createdAt', jsonb_build_object('__ts', jsonb_build_object(
        's', floor(extract(epoch from now()))::bigint, 'n', 0))
    ))
  )
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Deleting the auth account clears the profile. Firestore had no equivalent, so
-- `delete-data` used to leave the login working with an orphaned profile.
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.users where id = old.id::text;
  return old;
end
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_user();

-- ----------------------------------------------------- protected profile fields
-- firestore.rules blocked role / subscription / proExpiresAt from client writes.
-- RLS `with check` cannot see the pre-update row field-by-field, so the guard is
-- a trigger. Service-role callers (auth.uid() is null) and admins pass through.
create or replace function public.guard_user_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or public.is_admin() then
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

drop trigger if exists users_guard on public.users;
create trigger users_guard
  before update on public.users
  for each row execute function public.guard_user_fields();

-- =============================================================================
-- Row-level security — a direct port of firestore.rules
--
-- The service-role key bypasses all of this, which is what the API routes under
-- app/api use. Anything the browser touches goes through these policies.
-- =============================================================================

-- me() is the caller's id in the text form the tables store.
create or replace function public.me()
returns text language sql stable as $$ select auth.uid()::text $$;

-- ------------------------------------------------------------------- users
-- "Any authenticated user can READ profiles (community/leaderboard)."
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (auth.uid() is not null);

drop policy if exists users_insert on public.users;
create policy users_insert on public.users
  for insert with check (id = public.me() or public.is_admin());

drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update using (id = public.me() or public.is_admin());

drop policy if exists users_delete on public.users;
create policy users_delete on public.users
  for delete using (public.is_admin());

-- ------------------------------------------------------- lessons (public read)
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select using (true);

drop policy if exists lessons_write on public.lessons;
create policy lessons_write on public.lessons
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------- practice questions
drop policy if exists questions_select on public.practice_questions;
create policy questions_select on public.practice_questions
  for select using (auth.uid() is not null);

drop policy if exists questions_write on public.practice_questions;
create policy questions_write on public.practice_questions
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------- conversations
-- `?` tests object keys, not array members, so participation is `@>` against a
-- jsonb scalar: '["a","b"]' @> '"a"' is true.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (data -> 'participants' @> to_jsonb(public.me()) or public.is_admin());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (data -> 'participants' @> to_jsonb(public.me()));

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update using (data -> 'participants' @> to_jsonb(public.me()));

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
  for delete using (data -> 'participants' @> to_jsonb(public.me()) or public.is_admin());

-- ------------------------------------------------------------------ messages
create or replace function public.in_conversation(conv_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv_id and c.data -> 'participants' @> to_jsonb(auth.uid()::text)
  );
$$;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.in_conversation(parent_id));

-- The AI tutor writes as 'ai-bot' into the student's own conversation, which
-- firestore.rules allowed explicitly.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    public.in_conversation(parent_id)
    and (data ->> 'senderId' = public.me() or data ->> 'senderId' = 'ai-bot')
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update using (public.in_conversation(parent_id));

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete using (
    public.in_conversation(parent_id)
    and (data ->> 'senderId' = public.me() or data ->> 'senderId' = 'ai-bot')
  );

-- ---------------------------------------------------------------- challenges
drop policy if exists challenges_select on public.challenges;
create policy challenges_select on public.challenges
  for select using (auth.uid() is not null);

drop policy if exists challenges_write on public.challenges;
create policy challenges_write on public.challenges
  for all using (public.is_admin()) with check (public.is_admin());

-- Results are a per-challenge leaderboard, so any signed-in student may read
-- them; only the owner may add their own.
drop policy if exists challenge_results_select on public.challenge_results;
create policy challenge_results_select on public.challenge_results
  for select using (auth.uid() is not null);

drop policy if exists challenge_results_insert on public.challenge_results;
create policy challenge_results_insert on public.challenge_results
  for insert with check (data ->> 'userId' = public.me());

drop policy if exists challenge_results_write on public.challenge_results;
create policy challenge_results_write on public.challenge_results
  for all using (data ->> 'userId' = public.me() or public.is_admin())
  with check (data ->> 'userId' = public.me() or public.is_admin());

-- ------------------------------------------------------- verificationRequests
drop policy if exists verification_insert on public.verification_requests;
create policy verification_insert on public.verification_requests
  for insert with check (data ->> 'userId' = public.me());

drop policy if exists verification_select on public.verification_requests;
create policy verification_select on public.verification_requests
  for select using (data ->> 'userId' = public.me() or public.is_admin());

drop policy if exists verification_admin on public.verification_requests;
create policy verification_admin on public.verification_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- --------------------------------------------------------------- quizResults
drop policy if exists quiz_results_own on public.quiz_results;
create policy quiz_results_own on public.quiz_results
  for all using (data ->> 'userId' = public.me() or public.is_admin())
  with check (data ->> 'userId' = public.me() or public.is_admin());

-- ------------------------------------------------------------------ homework
drop policy if exists homework_select on public.homework;
create policy homework_select on public.homework
  for select using (
    (auth.uid() is not null and data ->> 'status' = 'published') or public.is_admin()
  );

drop policy if exists homework_write on public.homework;
create policy homework_write on public.homework
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists submissions_insert on public.homework_submissions;
create policy submissions_insert on public.homework_submissions
  for insert with check (data ->> 'studentId' = public.me());

drop policy if exists submissions_own on public.homework_submissions;
create policy submissions_own on public.homework_submissions
  for all using (data ->> 'studentId' = public.me() or public.is_admin())
  with check (data ->> 'studentId' = public.me() or public.is_admin());

-- --------------------------------------------------------------------- notes
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select using (
    (auth.uid() is not null and (data ->> 'isPublished')::boolean is true) or public.is_admin()
  );

drop policy if exists notes_write on public.notes;
create policy notes_write on public.notes
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------- reports
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert with check (data ->> 'reportedBy' = public.me());

drop policy if exists reports_admin on public.reports;
create policy reports_admin on public.reports
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------ settings
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- Query / write API
--
-- SECURITY INVOKER (the default) is load-bearing: these run as the caller, so
-- every policy above still applies. p_table is checked against an allowlist
-- before it reaches format('%I'), so a caller cannot name an arbitrary relation.
-- =============================================================================

create or replace function public.doc_table_ok(p_table text)
returns boolean language sql immutable as $$
  select p_table = any (array[
    'users', 'lessons', 'practice_questions', 'conversations', 'messages',
    'challenges', 'challenge_results', 'verification_requests', 'quiz_results',
    'homework', 'homework_submissions', 'notes', 'reports', 'settings'
  ]);
$$;

/*
 * One read path for getDoc, getDocs and getCountFromServer.
 *
 * p_filters  [{ "f": "userId", "op": "==", "v": "abc", "k": "text" }, ...]
 * p_orders   [{ "f": "createdAt", "dir": "desc" }, ...]
 * p_after    { "v": <jsonb scalar>, "id": "..." }  -- keyset cursor
 *
 * `k` says how to compare: doc_num() for numbers, booleans and timestamps,
 * doc_txt() for strings. The caller knows the type of the value it is comparing
 * against, which is the only reliable signal — the column itself is jsonb.
 */
create or replace function public.doc_query(
  p_table      text,
  p_parent     text default null,
  p_filters    jsonb default '[]'::jsonb,
  p_orders     jsonb default '[]'::jsonb,
  p_limit      int default null,
  p_after      jsonb default null,
  p_count_only boolean default false
)
returns table (id text, data jsonb, version bigint, total bigint)
language plpgsql
stable
as $$
declare
  v_where text := 'true';
  v_order text := '';
  v_sql   text;
  f       jsonb;
  o       jsonb;
  v_col   text;
  v_op    text;
  v_ord   text;
begin
  if not public.doc_table_ok(p_table) then
    raise exception 'Unknown collection %', p_table using errcode = '22023';
  end if;

  if p_parent is null then
    v_where := v_where || ' and parent_id is null';
  else
    v_where := v_where || format(' and parent_id = %L', p_parent);
  end if;

  for f in select * from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb))
  loop
    v_op := f ->> 'op';

    if v_op = 'array-contains' then
      v_where := v_where || format(
        ' and data -> %L @> %L::jsonb', f ->> 'f', coalesce(f -> 'v', 'null'::jsonb)::text
      );
      continue;
    end if;

    v_op := case v_op
              when '==' then '=' when '!=' then '<>'
              when '<' then '<'  when '<=' then '<='
              when '>' then '>'  when '>=' then '>='
              else null end;
    if v_op is null then
      raise exception 'Operator % is not supported by this store', f ->> 'op'
        using errcode = '22023';
    end if;

    if (f ->> 'k') in ('number', 'bool', 'ts') then
      v_col := format('public.doc_num(data -> %L)', f ->> 'f');
      v_where := v_where || format(
        ' and %s %s public.doc_num(%L::jsonb)', v_col, v_op, (f -> 'v')::text
      );
    else
      v_col := format('public.doc_txt(data -> %L)', f ->> 'f');
      v_where := v_where || format(' and %s %s %L', v_col, v_op, f ->> 'v');
    end if;
  end loop;

  if p_count_only then
    v_sql := format(
      'select null::text, null::jsonb, null::bigint, count(*)::bigint from public.%I where %s',
      p_table, v_where
    );
    return query execute v_sql;
    return;
  end if;

  -- Order by the numeric projection and the text projection of each key: within
  -- one field only one of the two is ever non-null, so the pair behaves as a
  -- single correctly-typed sort key. `id` closes it out so paging is stable.
  for o in select * from jsonb_array_elements(coalesce(p_orders, '[]'::jsonb))
  loop
    v_ord := case lower(coalesce(o ->> 'dir', 'asc')) when 'desc' then 'desc' else 'asc' end;
    v_order := v_order || format(
      'public.doc_num(data -> %L) %s nulls last, public.doc_txt(data -> %L) %s nulls last, ',
      o ->> 'f', v_ord, o ->> 'f', v_ord
    );
  end loop;

  if v_order = '' then
    v_order := 'created_at desc, id desc';
    v_ord := 'desc';
  else
    v_order := v_order || format('id %s', v_ord);
  end if;

  -- Keyset cursor for startAfter(). One sort key plus id covers every paged
  -- query in the app; more than that would need a row-comparison predicate.
  if p_after is not null then
    if jsonb_array_length(coalesce(p_orders, '[]'::jsonb)) > 1 then
      raise exception 'startAfter() supports a single orderBy in this store'
        using errcode = '22023';
    end if;

    if jsonb_array_length(coalesce(p_orders, '[]'::jsonb)) = 0 then
      v_where := v_where || format(
        ' and (created_at, id) < ((select created_at from public.%I where id = %L), %L)',
        p_table, p_after ->> 'id', p_after ->> 'id'
      );
    else
      v_col := p_orders -> 0 ->> 'f';
      v_where := v_where || format(
        ' and ( (public.doc_num(data -> %L), public.doc_txt(data -> %L), id) %s'
        || ' (public.doc_num(%L::jsonb), public.doc_txt(%L::jsonb), %L) )',
        v_col, v_col,
        case when v_ord = 'desc' then '<' else '>' end,
        coalesce(p_after -> 'v', 'null'::jsonb)::text,
        coalesce(p_after -> 'v', 'null'::jsonb)::text,
        p_after ->> 'id'
      );
    end if;
  end if;

  v_sql := format(
    'select id, data, version, null::bigint from public.%I where %s order by %s',
    p_table, v_where, v_order
  );
  if p_limit is not null and p_limit > 0 then
    v_sql := v_sql || format(' limit %s', p_limit);
  end if;

  return query execute v_sql;
end
$$;

/*
 * One write path for setDoc, addDoc, updateDoc and transaction commits.
 *
 * p_set  { "coins": 10, "quests.xpTier": 2 }  -- dotted keys set nested fields,
 *                                                exactly as Firestore did
 * p_ops  [{ "f": "xp", "op": "increment", "v": 25 }, ...]
 *
 * Sentinels are applied inside the same statement as the merge, so increment()
 * is genuinely atomic rather than the read-then-write it would be client-side.
 * p_expected_version raises serialization_failure when another writer got there
 * first, which is what lib/db.ts retries on.
 */
create or replace function public.doc_patch(
  p_table            text,
  p_id               text default null,
  p_parent           text default null,
  p_set              jsonb default '{}'::jsonb,
  p_ops              jsonb default '[]'::jsonb,
  p_replace          boolean default false,
  p_expected_version bigint default null,
  p_require_exists   boolean default false
)
returns table (id text, data jsonb, version bigint)
language plpgsql
as $$
declare
  v_id      text := coalesce(p_id, gen_random_uuid()::text);
  v_found   boolean := false;
  v_version bigint;
  v_data    jsonb := '{}'::jsonb;
  v_path    text[];
  v_arr     jsonb;
  kv        record;
  o         jsonb;
begin
  if not public.doc_table_ok(p_table) then
    raise exception 'Unknown collection %', p_table using errcode = '22023';
  end if;

  execute format('select data, version from public.%I where id = %L', p_table, v_id)
    into v_data, v_version;
  v_found := v_version is not null;

  if not v_found then
    if p_require_exists then
      raise exception 'No document at %/%', p_table, v_id using errcode = 'P0002';
    end if;
    v_data := '{}'::jsonb;
  elsif p_expected_version is not null and v_version <> p_expected_version then
    raise exception 'Document %/% changed under this transaction', p_table, v_id
      using errcode = '40001';
  elsif p_replace then
    v_data := '{}'::jsonb;
  end if;

  -- Plain fields. jsonb_set with create_missing gives Firestore's semantics for
  -- both "field" and "nested.field".
  for kv in select key, value from jsonb_each(coalesce(p_set, '{}'::jsonb))
  loop
    v_data := jsonb_set(v_data, string_to_array(kv.key, '.'), kv.value, true);
  end loop;

  for o in select * from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb))
  loop
    v_path := string_to_array(o ->> 'f', '.');

    case o ->> 'op'
      when 'delete' then
        v_data := v_data #- v_path;

      when 'serverTimestamp' then
        v_data := jsonb_set(v_data, v_path, jsonb_build_object(
          '__ts', jsonb_build_object(
            's', floor(extract(epoch from clock_timestamp()))::bigint, 'n', 0)
        ), true);

      when 'increment' then
        v_data := jsonb_set(v_data, v_path, to_jsonb(
          coalesce(public.doc_num(v_data #> v_path), 0)
          + coalesce((o #>> '{v}')::numeric, 0)
        ), true);

      when 'arrayUnion' then
        v_arr := coalesce(v_data #> v_path, '[]'::jsonb);
        if jsonb_typeof(v_arr) <> 'array' then v_arr := '[]'::jsonb; end if;
        v_arr := v_arr || (
          select coalesce(jsonb_agg(t.el), '[]'::jsonb)
          from jsonb_array_elements(coalesce(o -> 'v', '[]'::jsonb)) as t(el)
          where not (v_arr @> jsonb_build_array(t.el))
        );
        v_data := jsonb_set(v_data, v_path, v_arr, true);

      when 'arrayRemove' then
        v_arr := coalesce(v_data #> v_path, '[]'::jsonb);
        if jsonb_typeof(v_arr) <> 'array' then v_arr := '[]'::jsonb; end if;
        v_arr := (
          select coalesce(jsonb_agg(t.el), '[]'::jsonb)
          from jsonb_array_elements(v_arr) as t(el)
          where not (coalesce(o -> 'v', '[]'::jsonb) @> jsonb_build_array(t.el))
        );
        v_data := jsonb_set(v_data, v_path, v_arr, true);

      else
        raise exception 'Unknown field operation %', o ->> 'op' using errcode = '22023';
    end case;
  end loop;

  if v_found then
    return query execute format(
      'update public.%I set data = %L::jsonb, version = version + 1
         where id = %L returning id, data, version',
      p_table, v_data::text, v_id
    );
  else
    return query execute format(
      'insert into public.%I (id, parent_id, data) values (%L, %L, %L::jsonb)
         returning id, data, version',
      p_table, v_id, p_parent, v_data::text
    );
  end if;
end
$$;

-- =============================================================================
-- Grants
--
-- RLS does the real gatekeeping; these just make the tables and functions
-- reachable. Without them every policy evaluates against a role that cannot see
-- the relation in the first place.
-- =============================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;

-- =============================================================================
-- Realtime — replaces the two onSnapshot() listeners on the messages screen
-- =============================================================================

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end
$$;

-- =============================================================================
-- Storage — receipt uploads on /app/upgrade
--
-- Private bucket. A student may write only under their own uid prefix and read
-- only their own files; admins read everything for the verification queue.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = public.me());

drop policy if exists receipts_select on storage.objects;
create policy receipts_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = public.me() or public.is_admin())
  );

drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = public.me() or public.is_admin()));









