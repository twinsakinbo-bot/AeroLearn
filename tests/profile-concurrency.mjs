/** Real PostgreSQL sessions with explicit lock barriers. No timing-based race guesses. */
import assert from "node:assert/strict"
import { spawn, execFileSync } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
const container = process.argv[2]
assert.match(container, /^aerolearn-db-test-\d+$/)
const uid = "90000000-0000-4000-8000-000000000001"
const sql = (q) =>
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: q, encoding: "utf8" },
  ).trim()
function session(name) {
  const p = spawn(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    { stdio: ["pipe", "pipe", "pipe"] },
  )
  let out = "",
    err = ""
  p.stdout.on("data", (x) => (out += x))
  p.stderr.on("data", (x) => (err += x))
  const done = new Promise((resolve) => p.on("exit", (code) => resolve({ code, out, err })))
  p.stdin.write(`\\set VERBOSITY verbose\nset application_name='${name}';\n`)
  return {
    write: (q) => p.stdin.write(q + "\n"),
    end: () => p.stdin.end(),
    done,
    async marker(mark) {
      for (let i = 0; i < 200; i++) {
        if (out.includes(mark)) return
        await delay(20)
      }
      throw Error("Missing barrier " + mark + err)
    },
  }
}
async function blocked(name) {
  for (let i = 0; i < 150; i++) {
    const n = sql(
      `select count(*) from pg_stat_activity where application_name='${name}' and cardinality(pg_blocking_pids(pid))>0`,
    )
    if (n === "1") return
    await delay(20)
  }
  throw Error("Writer did not reach row-lock barrier: " + name)
}
sql(
  `grant all on all tables in schema public to service_role; insert into auth.users(id,email) values('${uid}','race-profile@example.invalid');`,
)
async function race(label, operation, patch, expected) {
  const version = sql(`select version from public.users where id='${uid}'`)
  const a = session(label + "-a"),
    b = session(label + "-b")
  a.write(`begin;${operation}; select 'LOCKED';`)
  await a.marker("LOCKED")
  b.write(`set role service_role;${patch(version)};`)
  b.end()
  await blocked(label + "-b")
  a.write("commit;")
  a.end()
  assert.equal((await a.done).code, 0)
  const result = await b.done
  if (expected === "conflict") {
    assert.equal(result.code, 3)
    assert.match(result.err, /40001/)
  } else assert.equal(result.code, 0, result.err)
  return JSON.parse(
    sql(`select jsonb_build_object('version',version,'data',data) from public.users where id='${uid}'`),
  )
}
let r = await race(
  "cas",
  `update public.users set data=data||'{"coins":1000}' where id='${uid}'`,
  (v) => `select * from public.doc_patch('users','${uid}',null,'{"coins":0}','[]',false,${v},true)`,
  "conflict",
)
assert.equal(r.data.coins, 1000)
r = await race(
  "merge",
  `select public.retail_reward('${uid}','purchase','{"item":"streak_freeze"}')`,
  () =>
    `select * from public.doc_patch('users','${uid}',null,'{"displayName":"Safe merge"}','[]',false,null,true)`,
  "merge",
)
assert.equal(r.data.coins, 800)
assert.deepEqual(r.data.inventory, ["streak_freeze"])
assert.equal(r.data.displayName, "Safe merge")
// Each writer waits behind an existing profile mutation. Once released it must
// calculate against the committed row, preserving all other fields and versions.
sql(`insert into public.lessons(id,data) values('race-lesson','{"subject":"Economics"}');
insert into mock_private.reward_events(user_id,event_key,xp,coins) values('${uid}','race-verified-xp',100,0);
insert into public.licence_codes(id,plan_id,status) values(encode(sha256(convert_to('RACEKEY0000001','UTF8')),'hex'),'monthly','available'),(encode(sha256(convert_to('RACEKEY0000002','UTF8')),'hex'),'monthly','available');`)
async function pair(name, first, second) {
  const before = Number(sql(`select version from public.users where id='${uid}'`))
  const a = session(name + "-a"),
    b = session(name + "-b")
  a.write(`begin;${first};select 'LOCKED';`)
  await a.marker("LOCKED")
  b.write(second + ";")
  b.end()
  await blocked(name + "-b")
  a.write("commit;")
  a.end()
  assert.equal((await a.done).code, 0)
  const br = await b.done
  assert.equal(br.code, 0, br.err)
  const data = JSON.parse(sql(`select data from public.users where id='${uid}'`))
  assert.ok(Number(sql(`select version from public.users where id='${uid}'`)) >= before)
  return data
}
sql(
  `update public.users set data=data||jsonb_build_object('lastActiveDate',((clock_timestamp() at time zone 'Africa/Lagos')::date-2)::text,'streak',5,'longestStreak',5) where id='${uid}';`,
)
r = await pair(
  "login-purchase",
  `select public.claim_login_reward('${uid}')`,
  `select public.retail_reward('${uid}','purchase','{"item":"gold_frame"}')`,
)
assert.equal(r.coins, 310)
assert.deepEqual(r.inventory, ["gold_frame"])
assert.equal(r.streak, 6)
r = await pair(
  "login-retry",
  `select public.claim_login_reward('${uid}')`,
  `select public.claim_login_reward('${uid}')`,
)
assert.equal(r.coins, 310)
r = await pair(
  "quest-retry",
  `select public.claim_quest_reward('${uid}','xp',1)`,
  `select public.claim_quest_reward('${uid}','xp',1)`,
)
assert.equal(r.coins, 330)
assert.equal(r.quests.xpTier, 2)
r = await pair(
  "lesson-challenge",
  `select public.retail_reward('${uid}','lesson','{"lesson":"race-lesson"}')`,
  `select public.claim_challenge_reward('${uid}','race-challenge',1,1,1,7,'Synthetic')`,
)
assert.equal(r.coins, 342)
r = await pair(
  "challenge-retry",
  `select public.claim_challenge_reward('${uid}','race-challenge-retry',1,1,1,7,'Synthetic')`,
  `select public.claim_challenge_reward('${uid}','race-challenge-retry',1,1,1,7,'Synthetic')`,
)
assert.equal(r.coins, 349)
// Two distinct codes must stack their terms instead of losing one extension.
const auth = `set local role authenticated;select set_config('request.jwt.claim.sub','${uid}',true);`
r = await pair(
  "licences",
  `${auth} select * from public.redeem_licence_code('RACEKEY0000001','${uid}')`,
  `begin;${auth} select * from public.redeem_licence_code('RACEKEY0000002','${uid}');commit`,
)
assert.equal(r.subscription, "monthly")
assert.ok(r.proExpiresAt.__ts.s > Date.now() / 1000 + 59 * 86400)
assert.equal(r.coins, 349)
assert.deepEqual(r.inventory, ["gold_frame"])
sql(
  `select public.start_mock_attempt('${uid}','WAEC','["Economics"]','revision','[{"id":"race-mock-q","question":"Synthetic","options":{"A":"1","B":"2","C":"3","D":"4"},"correctAnswer":"A"}]',true,'90000000-0000-4000-8000-000000000009');`,
)
r = await pair(
  "mock-login",
  `select public.submit_mock_attempt('${uid}','90000000-0000-4000-8000-000000000009','{"race-mock-q":"A"}')`,
  `select public.claim_login_reward('${uid}')`,
)
assert.equal(r.coins, 351)
assert.deepEqual(r.inventory, ["gold_frame"])
assert.equal(r.subscription, "monthly")
sql(`select public.submit_mock_attempt('${uid}','90000000-0000-4000-8000-000000000009','{}');`)
assert.equal(JSON.parse(sql(`select data from public.users where id='${uid}'`)).coins, 351)
r = await pair(
  "purchase-retry",
  `select public.retail_reward('${uid}','purchase','{"item":"streak_freeze"}')`,
  `select public.retail_reward('${uid}','purchase','{"item":"streak_freeze"}')`,
)
assert.equal(r.coins, 151)
assert.deepEqual(r.inventory, ["gold_frame", "streak_freeze"])
const staleExpiryVersion = Number(sql(`select version from public.users where id='${uid}'`))
sql(
  `insert into public.licence_codes(id,plan_id,status) values(encode(sha256(convert_to('RACEKEY0000003','UTF8')),'hex'),'monthly','available');`,
)
r = await pair(
  "lifetime-renewal",
  `update public.users set data=data||'{"subscription":"lifetime","proExpiresAt":null}' where id='${uid}'`,
  `begin;${auth} select * from public.redeem_licence_code('RACEKEY0000003','${uid}');commit`,
)
assert.equal(r.subscription, "lifetime")
assert.equal(r.proExpiresAt, null)
assert.equal(r.coins, 151)
sql(`do $$ begin
 begin perform public.doc_patch('users','${uid}',null,'{"subscription":"free","proExpiresAt":null}','[]',false,${staleExpiryVersion},true);raise exception 'Stale expiry reset was accepted';exception when serialization_failure then null;end;
 assert (select data->>'subscription' from public.users where id='${uid}')='lifetime';
end $$;`)
console.log(
  "Deterministic profile barriers passed: stale CAS rejected; merge preserved purchase; login/quest/challenge retries deduplicated; licence terms stacked; balances and inventory retained.",
)
