-- Run only against the disposable test database. No production writes.
\set ON_ERROR_STOP on
begin;
set local role service_role;
do $$
declare wait_seconds integer;
begin
  if public.take_api_rate_limit('rate-regression', 'reset-password-ip', 2, 60) <> 0 then
    raise exception 'First request denied';
  end if;
  if public.take_api_rate_limit('rate-regression', 'reset-password-ip', 2, 60) <> 0 then
    raise exception 'Second request denied';
  end if;
  wait_seconds := public.take_api_rate_limit('rate-regression', 'reset-password-ip', 2, 60);
  if wait_seconds < 1 or wait_seconds > 60 then raise exception 'Third request not limited'; end if;
  if public.take_api_rate_limit('rate-regression', 'verify-email-ip', 2, 60) <> 0 then
    raise exception 'Independent bucket was blocked';
  end if;
end $$;
reset role;
update public.api_rate_limits set reset_at = now() - interval '1 second' where uid = 'rate-regression';
set local role service_role;
do $$ begin
  if public.take_api_rate_limit('rate-regression', 'reset-password-ip', 2, 60) <> 0 then
    raise exception 'Expired window did not reset';
  end if;
end $$;
set local role authenticated;
do $$ begin
  begin
    perform public.take_api_rate_limit('rate-regression', 'reset-password-ip', 999, 60);
    raise exception 'Client can alter shared rate limit';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
