import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { licensingHttp } from "../lib/institutional/licensing-http";
import { parseLicensingCommand } from "../lib/institutional/licensing-contracts";
const org = "b1000000-0000-4000-8000-000000000001",
  id = "b4000000-0000-4000-8000-000000000001";
const command = {
  action: "issue_batch",
  institution_id: org,
  payload: { id, term_id: id, quantity: 2, expires_at: "2026-12-01T12:00:00Z" },
};
const req = (body: unknown = command, school = org) =>
  new Request("http://localhost/api/institutional/licensing", {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "X-Institution-Id": school },
    body: JSON.stringify(body),
  });
test("licensing contract rejects caller roles, cross-school links, prices, malformed dates and oversized batches", () => {
  assert.deepEqual(parseLicensingCommand(command), command);
  assert.ok(
    parseLicensingCommand({
      action: "approve_term",
      institution_id: org,
      payload: { id, approval_ref: " \tbank: inv-001\r\n" },
    }),
  );
  assert.equal(
    parseLicensingCommand({
      action: "approve_term",
      institution_id: org,
      payload: { id, approval_ref: "BANK:\u00a0INV-001" },
    }),
    null,
  );
  for (const bad of [
    { ...command, actor: id },
    { ...command, payload: { ...command.payload, role: "operator" } },
    { ...command, payload: { ...command.payload, quantity: 101 } },
    { ...command, payload: { ...command.payload, quantity: 1.5 } },
    {
      ...command,
      payload: { ...command.payload, expires_at: "2026-12-01T12:00" },
    },
    { ...command, payload: { ...command.payload, code: "chosen-secret" } },
    { action: "change_entitlement", institution_id: org, payload: {} },
    {
      action: "approve_term",
      institution_id: org,
      payload: { id, approval_ref: "" },
    },
    {
      action: "revoke_grant",
      institution_id: org,
      payload: { id, reason: "test" },
    },
  ])
    assert.equal(parseLicensingCommand(bad), null);
});
test("licensing disabled and missing identity fail before connecting", async () => {
  const noClient = () => {
    throw Error("No connection allowed");
  };
  assert.equal(
    (await licensingHttp(req(), { enabled: false }, noClient)).status,
    404,
  );
  assert.equal(
    (
      await licensingHttp(
        new Request("http://localhost"),
        { enabled: true },
        noClient,
      )
    ).status,
    401,
  );
});
test("licensing transport validates live Auth, pins school, preserves safe retries, hides errors and never caches codes", async () => {
  let authBad = false,
    dbCode = "",
    domainError = "",
    role = "school_admin";
  const calls: {
    url: string;
    authorization: string | undefined;
    body: string;
  }[] = [];
  const server = http.createServer(async (r, s) => {
    let body = "";
    for await (const chunk of r) body += chunk;
    calls.push({ url: r.url!, authorization: r.headers.authorization, body });
    s.setHeader("Content-Type", "application/json");
    if (r.url?.includes("/auth/v1/")) {
      s.statusCode = authBad ? 401 : 200;
      s.end(
        JSON.stringify(
          authBad ? { message: "bad" } : { id, aud: "authenticated" },
        ),
      );
      return;
    }
    if (dbCode) {
      s.statusCode = 400;
      s.end(
        JSON.stringify({
          code: dbCode,
          message: "PRIVATE code and database details",
        }),
      );
      return;
    }
    if (r.url?.includes("_context")) {
      s.end(
        JSON.stringify({
          role,
          operator: false,
          entitlement: null,
          cohorts: [],
        }),
      );
      return;
    }
    if (r.url?.includes("_dashboard")) {
      s.end(JSON.stringify({ terms: [] }));
      return;
    }
    s.end(
      JSON.stringify(
        domainError
          ? { error: domainError }
          : { id, codes: [{ seat_id: id, code: "a".repeat(64) }] },
      ),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const cfg = {
    enabled: true,
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    key: "test-publishable-key",
  };
  try {
    let r = await licensingHttp(req(), cfg);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("cache-control")!, /private, no-store/);
    assert.match(r.headers.get("vary")!, /X-Institution-Id/);
    assert.ok(calls.every((c) => c.authorization === "Bearer test-token"));
    assert.deepEqual(
      JSON.parse(calls.find((c) => c.url.includes("_command"))!.body),
      {
        p_action: "issue_batch",
        p_institution_id: org,
        p_payload: command.payload,
      },
    );
    calls.length = 0;
    assert.equal((await licensingHttp(req(command, id), cfg)).status, 400);
    assert.equal(calls.length, 1);
    assert.equal(
      (
        await licensingHttp(
          req({
            ...command,
            payload: { ...command.payload, notes: "x".repeat(5000) },
          }),
          cfg,
        )
      ).status,
      413,
    );
    for (const [code, status] of [
      ["42501", 403],
      ["54000", 409],
      ["P0001", 429],
      ["22023", 400],
    ] as const) {
      dbCode = code;
      r = await licensingHttp(req(), cfg);
      assert.equal(r.status, status);
      assert.doesNotMatch(await r.text(), /PRIVATE/);
    }
    dbCode = "23505";
    r = await licensingHttp(
      req({
        action: "approve_term",
        institution_id: org,
        payload: { id, approval_ref: "bank: inv-001" },
      }),
      cfg,
    );
    assert.equal(r.status, 409);
    const conflict = await r.text();
    assert.match(conflict, /already assigned.*cancelled terms/);
    assert.doesNotMatch(conflict, /PRIVATE/);
    dbCode = "";
    for (const [error, status] of [
      ["invalid_code", 409],
      ["existing_grant", 409],
      ["rate_limited", 429],
    ] as const) {
      domainError = error;
      assert.equal(
        (
          await licensingHttp(
            req({
              action: "redeem",
              institution_id: org,
              payload: { code: "b".repeat(64) },
            }),
            cfg,
          )
        ).status,
        status,
      );
    }
    domainError = "";
    const get = () =>
      new Request("http://localhost/api/institutional/licensing", {
        headers: {
          Authorization: "Bearer test-token",
          "X-Institution-Id": org,
        },
      });
    calls.length = 0;
    assert.equal((await licensingHttp(get(), cfg)).status, 200);
    assert.ok(calls.some((c) => c.url.includes("_dashboard")));
    role = "learner";
    calls.length = 0;
    assert.equal((await licensingHttp(get(), cfg)).status, 200);
    assert.ok(!calls.some((c) => c.url.includes("_dashboard")));
    authBad = true;
    calls.length = 0;
    assert.equal((await licensingHttp(req(), cfg)).status, 401);
    assert.equal(calls.length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
