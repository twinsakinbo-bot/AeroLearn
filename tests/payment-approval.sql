-- Transaction behavior only. Bank-transfer authenticity requires human review.
-- Run on a disposable migrated database as postgres; fake rows roll back.
\set ON_ERROR_STOP on
begin;

insert into public.users (id, data) values
  ('44444444-4444-4444-8444-444444444444', '{"role":"student","subscription":"free","email":"pay@example.invalid"}');
insert into public.verification_requests (id, data) values
  ('payment-smoke-valid', '{"userId":"44444444-4444-4444-8444-444444444444","status":"pending","planId":"monthly"}'),
  ('payment-smoke-invalid', '{"userId":"44444444-4444-4444-8444-444444444444","status":"pending","planId":"unknown"}');

do $$
declare expiry timestamptz;
begin
  begin
    perform public.approve_pending_receipt('payment-smoke-invalid', '44444444-4444-4444-8444-444444444444', 'reviewer-test');
    raise exception 'Unknown plan was approved';
  exception when sqlstate '22023' then null; end;
  if (select data ->> 'status' from public.verification_requests where id = 'payment-smoke-invalid') <> 'pending'
    or (select data ->> 'subscription' from public.users where id = '44444444-4444-4444-8444-444444444444') <> 'free' then
    raise exception 'Failed approval changed payment state';
  end if;

  expiry := public.approve_pending_receipt('payment-smoke-valid', '44444444-4444-4444-8444-444444444444', 'reviewer-test');
  if expiry not between now() + interval '29 days' and now() + interval '31 days'
    or (select data ->> 'subscription' from public.users where id = '44444444-4444-4444-8444-444444444444') <> 'monthly'
    or (select data ->> 'status' from public.verification_requests where id = 'payment-smoke-valid') <> 'approved' then
    raise exception 'Payment approval did not update plan and receipt together';
  end if;

  begin
    perform public.approve_pending_receipt('payment-smoke-valid', '44444444-4444-4444-8444-444444444444', 'reviewer-test');
    raise exception 'Receipt was approved twice';
  exception when sqlstate '22023' then null; end;
end $$;

rollback;
