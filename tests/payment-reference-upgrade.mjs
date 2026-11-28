/** Upgrade/preflight on disposable databases only; never rewrites reconciliation. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const container = process.argv[2];
assert.match(container, /^aerolearn-db-test-\d+$/);
const migration = "20261128153301_institutional_payment_integrity.sql";
const run = (database, query, fail = false) => {
  const r = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: "\\set VERBOSITY verbose\n" + query, encoding: "utf8" },
  );
  if (!fail) assert.equal(r.status, 0, r.stderr);
  return r;
};
const bootstrap = readFileSync(
  "tests/fixtures/supabase-bootstrap.sql",
  "utf8",
).replace(/^create role .*;$/gm, "");
const previous = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql") && f < migration)
  .sort()
  .map((f) => readFileSync("supabase/migrations/" + f, "utf8"))
  .join("\n");
const patch = readFileSync("supabase/migrations/" + migration, "utf8");
const fixture = readFileSync("tests/fixtures/licensing-fixture.sql", "utf8");
const insert = (school, cohort, id, ref) =>
  `insert into public.institutional_terms(institution_id,id,cohort_id,starts_at,ends_at,seat_cap,quoted_minor,state,approval_ref,approved_by,approved_at,created_by) values('${school}','${id}','${cohort}',now(),now()+interval '1 day',1,10000,'cancelled','${ref}','b0000000-0000-4000-8000-000000000001',now(),'b0000000-0000-4000-8000-000000000001');`;
for (const collision of [false, true]) {
  const database = collision
    ? "payment_collision_fixture"
    : "payment_history_fixture";
  run("postgres", `create database ${database} template template0;`);
  run(
    database,
    bootstrap +
      previous +
      fixture +
      insert(
        "b1000000-0000-4000-8000-000000000001",
        "b2000000-0000-4000-8000-000000000001",
        "b4000000-0000-4000-8000-000000000001",
        " bank: legacy - 001 ",
      ) +
      (collision
        ? insert(
            "b1000000-0000-4000-8000-000000000002",
            "b2000000-0000-4000-8000-000000000002",
            "b4000000-0000-4000-8000-000000000002",
            "BANK:LEGACY-001",
          )
        : ""),
  );
  const result = run(database, patch, collision);
  if (collision) {
    assert.equal(result.status, 3);
    assert.match(result.stderr, /23505/);
    assert.equal(
      run(
        database,
        "select count(*) from public.institutional_terms;",
      ).stdout.trim(),
      "2",
    );
    assert.equal(
      run(
        database,
        "select count(*) from information_schema.columns where table_schema='public' and table_name='institutional_terms' and column_name='approval_ref_key';",
      ).stdout.trim(),
      "0",
    );
    assert.equal(
      run(
        database,
        "select to_regprocedure('institutional_private.canonical_payment_reference(text)') is null;",
      ).stdout.trim(),
      "t",
    );
  } else {
    assert.equal(
      run(
        database,
        "select approval_ref=' bank: legacy - 001 ' and approval_ref_key='BANK:LEGACY-001' and state='cancelled' from public.institutional_terms;",
      ).stdout.trim(),
      "t",
    );
  }
}
console.log(
  "Payment upgrade: original cancelled reconciliation preserved; legacy canonical collisions abort the entire migration without changing/deleting records or leaving partial schema.",
);
