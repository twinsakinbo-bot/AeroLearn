#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# No host ports or production credentials. Everything is removed on exit.
test_container="aerolearn-db-test-$$"
trap 'docker rm -f -v "$test_container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$test_container" -e POSTGRES_PASSWORD=local-test-only postgres:17-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$test_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$test_container" pg_isready -h 127.0.0.1 -U postgres

run_sql() {
  echo "Checking $1"
  docker exec -i "$test_container" psql -X -q -U postgres -v ON_ERROR_STOP=1 < "$1"
}
run_sql tests/fixtures/supabase-bootstrap.sql
for migration in supabase/migrations/*.sql; do run_sql "$migration"; done
for test_file in tests/security-policies.sql tests/security-access.sql tests/payment-approval.sql tests/licence-redemption.sql tests/shared-rate-limit.sql; do
  run_sql "$test_file"
done
echo "Database migration and access checks passed."
