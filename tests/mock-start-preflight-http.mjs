/** Real production-mode Next handler, local spy backend: no real accounts/content. */
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const school = "b1000000-0000-4000-8000-000000000001",
  other = "b1000000-0000-4000-8000-000000000002";
let context = null,
  contextFailure = false,
  app,
  logs = "";
const calls = [];
const backend = http.createServer(async (req, res) => {
  calls.push(req.url);
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/v1/user") {
    res.end(
      JSON.stringify({
        id: "b0000000-0000-4000-8000-000000000004",
        aud: "authenticated",
      }),
    );
    return;
  }
  if (req.url === "/rest/v1/rpc/institutional_licensing_context") {
    if (contextFailure) {
      res.statusCode = 403;
      res.end(
        JSON.stringify({ code: "42501", message: "Private school denied" }),
      );
      return;
    }
    res.end(JSON.stringify({ entitlement: context }));
    return;
  }
  if (req.url.startsWith("/rest/v1/mock_question_bank?")) {
    res.end("[]");
    return;
  }
  res.statusCode = 500;
  res.end(JSON.stringify({ message: "Unexpected business access" }));
});
await new Promise((r) => backend.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:4326";
async function start(master, licensing) {
  logs = "";
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "4326",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${backend.address().port}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon",
        SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
        INSTITUTIONAL_MVP_ENABLED: master,
        INSTITUTIONAL_LICENSING_ENABLED: licensing,
        MOCK_DRAFT_REVIEW_ENABLED: "true",
        RESEND_API_KEY: "",
        COARENA_API_KEY: "",
        AETHER_API_KEY: "",
      },
    },
  );
  for (const s of [app.stdout, app.stderr])
    s.on("data", (x) => (logs = (logs + x).slice(-8000)));
  for (let i = 0; i < 90; i++) {
    if (app.exitCode !== null) throw Error(logs);
    try {
      if ((await fetch(base)).ok) return;
    } catch {}
    await delay(250);
  }
  throw Error("Next startup timeout " + logs);
}
async function stop() {
  if (app && app.exitCode === null) {
    app.kill("SIGTERM");
    await new Promise((r) => app.once("exit", r));
  }
  app = undefined;
}
const body = {
  action: "start",
  requestId: "b6000000-0000-4000-8000-000000000001",
  exam: "WAEC",
  subjects: ["Economics"],
  mode: "full",
  institutionId: school,
};
async function send(payload = body, header = school) {
  calls.length = 0;
  const response = await fetch(base + "/api/mock-exams", {
    method: "POST",
    headers: {
      Authorization: "Bearer synthetic-student",
      "Content-Type": "application/json",
      ...(header ? { "X-Institution-Id": header } : {}),
    },
    body: JSON.stringify(payload),
  });
  return response;
}
function noBank() {
  assert.ok(!calls.some((p) => p.startsWith("/rest/v1/mock_question_bank")));
  assert.ok(
    calls.every(
      (p) =>
        p === "/auth/v1/user" ||
        p === "/rest/v1/rpc/institutional_licensing_context",
    ),
  );
}
try {
  for (const flags of [
    ["false", "true"],
    ["true", "false"],
  ]) {
    await start(...flags);
    assert.equal((await send()).status, 403);
    noBank();
    assert.equal(calls.length, 1);
    await stop();
  }
  await start("true", "true");
  for (const [payload, header] of [
    [{ ...body, institutionId: "bad-id" }, school],
    [body, other],
    [body, null],
    [{ ...body, institutionId: null }, school],
    [{ ...body, institutionId: undefined }, school],
  ]) {
    assert.equal((await send(payload, header)).status, 400);
    noBank();
    assert.equal(calls.length, 1);
  }
  assert.equal((await send({ ...body, mode: "draft_review" })).status, 403);
  noBank();
  assert.equal(calls.length, 1);
  context = null;
  assert.equal((await send()).status, 403);
  noBank();
  assert.equal(calls.length, 2);
  contextFailure = true;
  assert.equal((await send()).status, 403);
  noBank();
  contextFailure = false;
  // Positive controls ensure these assertions really cover the live bank-loading path.
  context = { namespace: "institutional_revision" };
  assert.equal((await send()).status, 409);
  assert.equal(
    calls.filter((p) => p.startsWith("/rest/v1/mock_question_bank")).length,
    1,
  );
  assert.equal(
    (await send({ ...body, institutionId: undefined }, null)).status,
    409,
  );
  assert.equal(
    calls.filter((p) => p.startsWith("/rest/v1/mock_question_bank")).length,
    1,
  );
  assert.ok(!calls.some((p) => p.includes("institutional_licensing_context")));
  console.log(
    "12 mock-start preflight cases passed: both flags, malformed/mismatched/orphan context, school draft denial, absent/denied live entitlement before bank, and legitimate school/retail bank-load controls.",
  );
} finally {
  await stop();
  backend.closeAllConnections();
  await new Promise((r) => backend.close(r));
}
