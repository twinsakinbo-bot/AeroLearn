/** Real PostgreSQL sessions with explicit lock barriers. No timing-based race guesses. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const container = process.argv[2];
assert.match(container, /^aerolearn-db-test-\d+$/);
const org = "b1000000-0000-4000-8000-000000000001";
const sql = (q) =>
  execFileSync(
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
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: q, encoding: "utf8" },
  ).trim();
function session(name) {
  const p = spawn(
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
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let out = "",
    err = "";
  p.stdout.on("data", (x) => (out += x));
  p.stderr.on("data", (x) => (err += x));
  const done = new Promise((resolve) =>
    p.on("exit", (code) => resolve({ code, out, err })),
  );
  p.stdin.write(`\\set VERBOSITY verbose\nset application_name='${name}';\n`);
  return {
    write: (q) => p.stdin.write(q + "\n"),
    end: () => p.stdin.end(),
    done,
    async marker(mark) {
      for (let i = 0; i < 200; i++) {
        if (out.includes(mark)) return;
        await delay(20);
      }
      throw Error("Missing barrier " + mark + err);
    },
  };
}
async function blocked(name) {
  for (let i = 0; i < 150; i++) {
    const n = sql(
      `select count(*) from pg_stat_activity where application_name='${name}' and cardinality(pg_blocking_pids(pid))>0`,
    );
    if (n === "1") return;
    await delay(20);
  }
  throw Error("Writer did not reach row-lock barrier: " + name);
}
const uid = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const auth = (n) =>
  `set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false);`;
const command = (action, payload) =>
  `select public.institutional_licensing_command('${action}','${org}','${JSON.stringify(payload)}'::jsonb)`;
sql("\\i /tmp/aerolearn-licensing-fixture.sql");
let term;
function newTerm(cap) {
  if (term)
    sql(
      auth(1) +
        command("cancel_term", { id: term, reason: "Synthetic race complete" }),
    );
  term = crypto.randomUUID();
  sql(
    auth(1) +
      command("draft_term", {
        id: term,
        cohort_id: "b2000000-0000-4000-8000-000000000001",
        starts_at: new Date(Date.now() - 86400000).toISOString(),
        ends_at: new Date(Date.now() + 86400000 * 2).toISOString(),
        seat_cap: cap,
        quoted_minor: 0,
        renewal_of: null,
      }) +
      ";" +
      command("approve_term", { id: term, approval_ref: "SYNTHETIC-RACE" }) +
      ";" +
      command("activate_term", { id: term }),
  );
}
function batch(id = crypto.randomUUID(), quantity = 1) {
  return {
    id,
    term_id: term,
    quantity,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
}
function result(output) {
  return output
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l));
}
async function race(
  label,
  actorA,
  operationA,
  actorB,
  operationB,
  expected = "ok",
) {
  const a = session("licensing-" + label + "-a"),
    b = session("licensing-" + label + "-b");
  a.write(`begin;${actorA};${operationA};select 'LOCKED';`);
  await a.marker("LOCKED");
  b.write(`${actorB};${operationB};`);
  b.end();
  await blocked("licensing-" + label + "-b");
  a.write("commit;");
  a.end();
  const ar = await a.done,
    br = await b.done;
  assert.equal(ar.code, 0, ar.err);
  if (expected === "ok") assert.equal(br.code, 0, br.err);
  else {
    assert.equal(br.code, 3);
    assert.match(br.err, new RegExp(expected));
  }
  return [result(ar.out), result(br.out)];
}
newTerm(1);
await race(
  "last-seat",
  auth(2),
  command("issue_batch", batch()),
  auth(2),
  command("issue_batch", batch()),
  "54000",
);
assert.equal(
  sql(
    `select count(*) from public.institutional_batches where term_id='${term}'`,
  ),
  "1",
);
assert.equal(
  sql(
    `select count(*) from public.institutional_seats where term_id='${term}' and state='issued'`,
  ),
  "1",
);
newTerm(2);
const same = batch();
let [a, b] = await race(
  "batch-retry",
  auth(2),
  command("issue_batch", same),
  auth(2),
  command("issue_batch", same),
);
assert.equal(a[0].codes.length, 1);
assert.equal(b[0].replayed, true);
assert.equal(b[0].codes.length, 0);
assert.equal(
  sql(
    `select count(*) from public.institutional_seats where term_id='${term}' and state='issued'`,
  ),
  "1",
);
newTerm(1);
let issued = result(sql(auth(2) + command("issue_batch", batch())))[0];
[a, b] = await race(
  "two-learners",
  auth(4),
  command("redeem", { code: issued.codes[0].code }),
  auth(5),
  command("redeem", { code: issued.codes[0].code }),
);
assert.ok(a[0].id);
assert.equal(b[0].error, "invalid_code");
assert.equal(
  sql(
    `select count(*) from public.institutional_grants where term_id='${term}'`,
  ),
  "1",
);
newTerm(1);
issued = result(sql(auth(2) + command("issue_batch", batch())))[0];
[a, b] = await race(
  "claim-retry",
  auth(4),
  command("redeem", { code: issued.codes[0].code }),
  auth(4),
  command("redeem", { code: issued.codes[0].code }),
);
assert.equal(a[0].id, b[0].id);
assert.equal(b[0].replayed, true);
assert.equal(
  sql(
    `select count(*) from public.institutional_grants where term_id='${term}'`,
  ),
  "1",
);
newTerm(1);
issued = result(sql(auth(2) + command("issue_batch", batch())))[0];
await race(
  "revoked-membership",
  auth(1),
  `select public.institutional_command('revoke_member','${org}','{"id":"b3000000-0000-4000-8000-000000000005"}')`,
  auth(5),
  command("redeem", { code: issued.codes[0].code }),
  "42501",
);
assert.equal(
  sql(
    `select count(*) from public.institutional_grants where term_id='${term}'`,
  ),
  "0",
);
// Expiry after the waiting statement began: clock_timestamp must be checked after the lock.
[a, b] = await race(
  "code-expiry",
  "reset role",
  `select 1 from public.institutions where id='${org}' for update;update institutional_private.learner_codes set expires_at=clock_timestamp()-interval '1 second' where seat_id='${issued.codes[0].seat_id}'`,
  auth(6),
  command("redeem", { code: issued.codes[0].code }),
);
assert.equal(b[0].error, "invalid_code");
// Manual activation retried concurrently cannot create an extra pool.
newTerm(1);
sql(
  `update public.institutional_terms set state='approved' where id='${term}';delete from public.institutional_seats where term_id='${term}'`,
);
await race(
  "activation",
  auth(1),
  command("activate_term", { id: term }),
  auth(1),
  command("activate_term", { id: term }),
  "22023",
);
assert.equal(
  sql(
    `select count(*) from public.institutional_seats where term_id='${term}'`,
  ),
  "1",
);
issued = result(sql(auth(2) + command("issue_batch", batch())))[0];
sql(auth(6) + command("redeem", { code: issued.codes[0].code }));
await race(
  "term-expiry",
  "reset role",
  `select 1 from public.institutions where id='${org}' for update;update public.institutional_terms set ends_at=clock_timestamp()-interval '1 second' where id='${term}'`,
  "set role service_role",
  `select public.start_institutional_mock('${uid(6)}','${org}','WAEC','["Economics"]','revision','[]','${crypto.randomUUID()}')`,
  "42501",
);
// Competing final issuance-quota requests also serialize, even when both have free seats.
newTerm(2);
const count = Number(
  sql(
    `select count(*) from public.institutional_batches where institution_id='${org}' and created_at>clock_timestamp()-interval '1 hour'`,
  ),
);
assert.ok(count < 20);
sql(
  `insert into public.institutional_batches(institution_id,id,term_id,quantity,code_expires_at,issued_by,cancelled_at) select '${org}',gen_random_uuid(),'${term}',1,clock_timestamp()+interval '1 hour','${uid(2)}',clock_timestamp() from generate_series(1,${19 - count})`,
);
await race(
  "issuance-quota",
  auth(2),
  command("issue_batch", batch()),
  auth(2),
  command("issue_batch", batch()),
  "P0001",
);
assert.equal(
  sql(
    `select count(*) from public.institutional_batches where institution_id='${org}' and created_at>clock_timestamp()-interval '1 hour'`,
  ),
  "20",
);
assert.equal(
  sql(
    `select count(*) from public.institutional_seats where term_id='${term}' and state='issued'`,
  ),
  "1",
);
// A later renewal cannot stack into retail or silently revive a suspended previous grant.
assert.equal(
  sql(`select data->>'subscription' from public.users where id='${uid(4)}'`),
  "lifetime",
);
assert.equal(
  sql(`select data->>'coins' from public.users where id='${uid(4)}'`),
  "4321",
);
console.log(
  "Institutional licensing: 9 deterministic row-lock barriers passed (last seat, batch retry, competing claim, claim retry, revocation, code expiry, activation, term expiry, issuance quota); retail balances and lifetime access preserved.",
);
