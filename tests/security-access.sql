-- Functional RLS smoke test for a disposable migrated database only.
-- Requires a postgres connection capable of SET ROLE authenticated.
-- All fake rows are rolled back, even when the assertions succeed.
\set ON_ERROR_STOP on
begin;

insert into public.users (id, data) values
  ('11111111-1111-4111-8111-111111111111', '{"role":"student","subscription":"free","displayName":"Test A","email":"a@example.invalid"}'),
  ('22222222-2222-4222-8222-222222222222', '{"role":"student","subscription":"free","displayName":"Test B","email":"b@example.invalid"}');
insert into public.conversations (id, data) values
  ('rls-smoke-group', '{"type":"group","participants":["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"],"admins":["22222222-2222-4222-8222-222222222222"]}'),
  ('rls-smoke-no-admin', '{"type":"group","participants":["11111111-1111-4111-8111-111111111111"]}');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare
  a constant text := '11111111-1111-4111-8111-111111111111';
  b constant text := '22222222-2222-4222-8222-222222222222';
begin
  if (select count(*) from public.users where id = a) <> 1
    or (select count(*) from public.users where id = b) <> 0 then
    raise exception 'A student can read another private profile';
  end if;
  if not exists (select 1 from public.public_profiles where id = b and data ->> 'displayName' = 'Test B' and not data ? 'email') then
    raise exception 'Public profile projection is missing or contains email';
  end if;

  begin
    perform set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
    insert into public.users (id, data) values
      ('33333333-3333-4333-8333-333333333333', '{"role":"admin","subscription":"lifetime"}');
    raise exception 'Student created an admin profile';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claim.sub', a, true);

  begin
    update public.users set data = data || '{"role":"admin","subscription":"lifetime"}'::jsonb where id = a;
    raise exception 'Student promoted their profile';
  exception when sqlstate '42501' then null; end;

  begin
    update public.conversations set data = jsonb_set(data, '{admins}', to_jsonb(array[a]))
      where id = 'rls-smoke-group';
    raise exception 'Group member promoted themselves';
  exception when sqlstate '42501' then null; end;

  begin
    update public.conversations set data = jsonb_set(data, '{admins}', to_jsonb(array[a]))
      where id = 'rls-smoke-no-admin';
    raise exception 'Missing admin list allowed self-promotion';
  exception when sqlstate '42501' then null; end;

  begin
    insert into public.messages (id, parent_id, data) values
      ('rls-smoke-bot', 'rls-smoke-group', '{"senderId":"ai-bot","text":"Forged"}');
    raise exception 'Student forged an AI message';
  exception when sqlstate '42501' then null; end;

  begin
    insert into public.challenge_results (id, data) values
      ('rls-smoke-reward', jsonb_build_object('userId', a, 'score', 100));
    raise exception 'Student forged a challenge result';
  exception when sqlstate '42501' then null; end;

  begin
    insert into public.verification_requests (id, data) values
      ('rls-smoke-receipt', jsonb_build_object('userId', a, 'status', 'approved'));
    raise exception 'Student submitted a preapproved receipt';
  exception when sqlstate '42501' then null; end;
end $$;

rollback;
