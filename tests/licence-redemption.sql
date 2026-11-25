-- Authenticated, one-time licence redemption on a disposable database.
\set ON_ERROR_STOP on
begin;

insert into public.users (id, data) values
  ('55555555-5555-4555-8555-555555555555', '{"role":"student","subscription":"free","email":"redeem@example.invalid"}');
insert into public.licence_codes (id, plan_id, status) values
  (encode(digest('ABCDEF12345678', 'sha256'), 'hex'), 'monthly', 'available');

set local role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);

do $$
declare result record;
begin
  begin
    perform public.redeem_licence_code('ABCDEF12345678', '66666666-6666-4666-8666-666666666666');
    raise exception 'Student redeemed for another account';
  exception when sqlstate '42501' then null; end;

  select * into result from public.redeem_licence_code('ABCDEF12345678', '55555555-5555-4555-8555-555555555555');
  if result.status <> 'ok' or result.plan_id <> 'monthly'
    or result.expires_at not between now() + interval '29 days' and now() + interval '31 days'
    or (select data ->> 'subscription' from public.users where id = '55555555-5555-4555-8555-555555555555') <> 'monthly' then
    raise exception 'Licence did not grant the expected plan';
  end if;

  select * into result from public.redeem_licence_code('ABCDEF12345678', '55555555-5555-4555-8555-555555555555');
  if result.status <> 'used' then raise exception 'Code was redeemable twice'; end if;
end $$;

rollback;
