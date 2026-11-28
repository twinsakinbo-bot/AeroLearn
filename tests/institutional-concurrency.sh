#!/usr/bin/env bash
set -euo pipefail
# Called only by run-database-tests.sh against its disposable, unexposed container.
test_container="$1"
[[ "$test_container" == aerolearn-db-test-* ]] || exit 1
run_sql() { docker exec -i "$test_container" psql -X -q -U postgres -v ON_ERROR_STOP=1; }
run_sql <<'SQL'
insert into auth.users(id,email,email_confirmed_at) values
 ('c0000000-0000-4000-8000-000000000001','operator@example.invalid',now()),
 ('c0000000-0000-4000-8000-000000000002','teacher@example.invalid',now());
insert into institutional_private.operators(user_id) values('c0000000-0000-4000-8000-000000000001');
update institutional_private.controls set enabled=true;
create schema concurrency_fixture;
create table concurrency_fixture.invitation(org uuid, token text);
grant usage on schema concurrency_fixture to authenticated;
grant select on concurrency_fixture.invitation to authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000001',false);
do $$ declare org uuid; inv jsonb; begin
 org:=(public.institutional_command('create_institution',null,'{"name":"Synthetic concurrency school"}')->>'institution_id')::uuid;
 inv:=public.institutional_command('invite_staff',org,'{"email":"teacher@example.invalid","role":"teacher"}');
 insert into concurrency_fixture.invitation values(org,inv->>'token');
end $$;
SQL
claim() {
run_sql <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','c0000000-0000-4000-8000-000000000002',false);
do $$ begin
 perform public.institutional_command('accept_invite',org,jsonb_build_object('token',token)) from concurrency_fixture.invitation;
 raise notice 'CLAIM_OK';
exception when insufficient_privilege then raise notice 'CLAIM_DENIED';
end $$;
SQL
}
result_dir=$(mktemp -d)
trap 'rm -rf "$result_dir"' EXIT
claim > "$result_dir/one" 2>&1 & first_pid=$!
claim > "$result_dir/two" 2>&1 & second_pid=$!
wait "$first_pid"
wait "$second_pid"
[[ $(awk '/CLAIM_OK/ { n++ } END { print n+0 }' "$result_dir/one" "$result_dir/two") == 1 ]]
[[ $(awk '/CLAIM_DENIED/ { n++ } END { print n+0 }' "$result_dir/one" "$result_dir/two") == 1 ]]
run_sql <<'SQL'
do $$ begin
 assert (select count(*) from public.institution_memberships where user_id='c0000000-0000-4000-8000-000000000002')=1,'Concurrent invitation duplicated membership';
 assert (select count(*) from institutional_private.audit where action='accept_invite' and actor_id='c0000000-0000-4000-8000-000000000002')=1,'Concurrent acceptance audit mismatch';
end $$;
SQL
echo 'Concurrent one-use invitation: one accepted, one denied, one membership and audit event.'
