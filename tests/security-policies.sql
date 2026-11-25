-- Read-only checks for a disposable local/staging Supabase database after 0003.
-- Never point this at production as a substitute for a staged functional test.
begin read only;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'users'
      and policyname = 'users_select' and qual like '%auth.uid()%'
  ) then raise exception 'Private profile read policy is missing'; end if;

  if has_table_privilege('anon', 'public.public_profiles', 'select')
    or not has_table_privilege('authenticated', 'public.public_profiles', 'select') then
    raise exception 'Public profile projection grants are incorrect';
  end if;

  if has_function_privilege('authenticated',
      'public.claim_challenge_reward(text,text,integer,integer,integer,integer,text)', 'execute')
    or not has_function_privilege('service_role',
      'public.claim_challenge_reward(text,text,integer,integer,integer,integer,text)', 'execute') then
    raise exception 'Challenge reward RPC grants are incorrect';
  end if;

  if has_function_privilege('authenticated',
      'public.take_api_rate_limit(text,text,integer,integer)', 'execute') then
    raise exception 'AI rate limiter is callable by students';
  end if;
  if has_function_privilege('authenticated',
      'public.take_daily_quota(text,text,integer)', 'execute')
    or has_table_privilege('authenticated', 'public.api_daily_usage', 'select') then
    raise exception 'Free plan quota can be changed by students';
  end if;
  if has_function_privilege('authenticated',
      'public.approve_pending_receipt(text,text,text)', 'execute')
    or not has_function_privilege('service_role',
      'public.approve_pending_receipt(text,text,text)', 'execute') then
    raise exception 'Payment approval RPC is callable by students';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'messages' and cmd in ('UPDATE', 'ALL'))
    or not exists (select 1 from pg_trigger where tgname = 'conversations_membership_guard'
      and tgenabled = 'O') then
    raise exception 'Chat message or membership guard is missing';
  end if;

  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'challenge_results'
      and cmd in ('INSERT', 'UPDATE', 'ALL')
  ) then raise exception 'Client challenge result writes are still enabled'; end if;
end $$;
rollback;
