#!/usr/bin/env bash
set -euo pipefail
container="$1"
[[ "$container" == aerolearn-db-test-* ]] || exit 1
run_sql() { docker exec -i "$container" psql -X -q -U postgres -v ON_ERROR_STOP=1; }
run_sql <<'SQL'
insert into auth.users(id,email,email_confirmed_at) values('b0000000-0000-4000-8000-000000000099','quota-operator@example.invalid',now());
insert into institutional_private.operators(user_id) values('b0000000-0000-4000-8000-000000000099');
insert into public.institutions(id,name) values('b0000000-0000-4000-8000-000000000098','Synthetic quota concurrency');
update institutional_private.controls set enabled=true;
insert into institutional_private.invite_limits values('actor:b0000000-0000-4000-8000-000000000099',date_trunc('hour',now()),9);
SQL
scratch_dir=$(mktemp -d)
trap 'rm -rf "$scratch_dir"' EXIT
invoke() {
 run_sql <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-000000000099',true);
select public.institutional_command('invite_staff','b0000000-0000-4000-8000-000000000098','{"email":"quota-invite@example.invalid","role":"teacher"}');
commit;
SQL
}
invoke > "$scratch_dir/a" 2>&1 & first=$!
invoke > "$scratch_dir/b" 2>&1 & second=$!
passed=0
if wait "$first";then passed=$((passed+1));fi
if wait "$second";then passed=$((passed+1));fi
[[ "$passed" == 1 ]] || { cat "$scratch_dir/a" "$scratch_dir/b";exit 1; }
run_sql <<'SQL'
do $$ begin
 assert (select hits from institutional_private.invite_limits where scope='actor:b0000000-0000-4000-8000-000000000099')=10;
 assert (select count(*) from institutional_private.staff_invites where institution_id='b0000000-0000-4000-8000-000000000098')=1;
end $$;
SQL
echo 'Concurrent invitation quota: exactly one of two competing final-slot requests accepted.'
run_sql <<'SQL'
insert into public.lessons(id,data) values('concurrent-reward-lesson','{"subject":"Economics"}');
SQL
reward() {
 run_sql <<'SQL'
set role service_role;
select public.retail_reward('b0000000-0000-4000-8000-000000000099','lesson','{"lesson":"concurrent-reward-lesson"}');
SQL
}
reward > "$scratch_dir/reward-a" 2>&1 & first=$!
reward > "$scratch_dir/reward-b" 2>&1 & second=$!
wait "$first"; wait "$second"
run_sql <<'SQL'
do $$ begin
 assert (select count(*) from mock_private.reward_events where user_id='b0000000-0000-4000-8000-000000000099')=1;
 assert (select data->>'xp' from public.users where id='b0000000-0000-4000-8000-000000000099')='10';
 assert (select data->>'coins' from public.users where id='b0000000-0000-4000-8000-000000000099')='5';
end $$;
SQL
echo 'Concurrent lesson award: two requests, one ledger event and one XP/coin update.'
revision_pool() {
 run_sql <<'SQL'
insert into public.practice_questions(id,data) values('pool-revision-race','{"question":"Synthetic simultaneous pool race","correctAnswer":"A"}');
SQL
}
trusted_pool() {
 run_sql <<'SQL'
insert into mock_private.assessment_questions(id,data) values('pool-trusted-race','{"question":"Synthetic simultaneous pool race","publicationStatus":"approved","correctAnswer":"A"}');
SQL
}
revision_pool > "$scratch_dir/pool-a" 2>&1 & first=$!
trusted_pool > "$scratch_dir/pool-b" 2>&1 & second=$!
passed=0
if wait "$first";then passed=$((passed+1));fi
if wait "$second";then passed=$((passed+1));fi
[[ "$passed" == 1 ]] || { cat "$scratch_dir/pool-a" "$scratch_dir/pool-b";exit 1; }
echo 'Concurrent question publication: identical content cannot commit to both pools.'
