/** Invoked by the real local Supabase suite. No mock Auth or PostgREST. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
export async function verifyInstitutionalLicensing({
  pool,
  actors,
  request,
  command,
  browser,
  base,
  ok,
  a,
  b,
  cohort,
  learner,
}) {
  const evidence = "docs/evidence/licensing";
  mkdirSync(evidence, { recursive: true });
  const endpoint = "/api/institutional/licensing";
  const call = (name, action, payload, org = a) =>
    request(name, endpoint, { action, institution_id: org, payload }, org);
  assert.equal(
    (await request("operator", endpoint)).status,
    403,
    "DB licensing defaults off",
  );
  await pool.query(
    "update institutional_private.licensing_controls set enabled=true",
  );
  assert.equal((await request("adminB", endpoint, null, a)).status, 403);
  assert.equal((await request("retail", endpoint, null, a)).status, 403);
  assert.ok(
    (
      await actors.learner.client
        .from("institutional_terms")
        .insert({ institution_id: a })
    ).error,
  );
  assert.ok(
    (
      await actors.learner.client.rpc("institutional_licensing_dashboard", {
        p_institution_id: a,
      })
    ).error,
  );
  assert.ok(
    (
      await actors.learner.client
        .schema("institutional_private")
        .from("learner_codes")
        .select("*")
    ).error,
  );
  const before = (
    await pool.query("select data,version from public.users where id=$1", [
      actors.learner.id,
    ])
  ).rows[0];
  // Existing retail access, deliberately held concurrently with a separate institutional grant.

  async function pageFor(name, width) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addCookies([
      {
        name: "sb-127-auth-token",
        value:
          "base64-" +
          Buffer.from(JSON.stringify(actors[name].session)).toString(
            "base64url",
          ),
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    page.on("dialog", (d) => d.accept());
    await page.goto(base + "/app/institutional");
    await page.getByLabel("School", { exact: true }).selectOption(a);
    await page.getByText("Access:", { exact: false }).waitFor();
    return { ctx, page };
  }
  async function prepareScreenshot(page) {
    const dismiss = page.getByRole("button", {
      name: "Dismiss streak message",
      exact: true,
    });
    if (await dismiss.count()) await dismiss.click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
  }
  const { ctx, page } = await pageFor("operator", 1280);
  await page.getByLabel("Cohort", { exact: true }).selectOption(cohort);
  await page
    .getByLabel("Starts (device time)", { exact: true })
    .fill(new Date(Date.now() - 86400000).toISOString().slice(0, 16));
  await page
    .getByLabel("Ends (device time)", { exact: true })
    .fill(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16));
  await page.getByLabel("Seat cap", { exact: true }).fill("3");
  await page.getByLabel("Agreed quote (NGN)", { exact: true }).fill("1000.00");
  await page
    .getByRole("button", { name: "Create draft term", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "draft term completed" })
    .waitFor();
  const term = (
    await pool.query(
      "select * from public.institutional_terms where institution_id=$1",
      [a],
    )
  ).rows[0];
  assert.equal(term.state, "draft");
  assert.equal(term.quoted_minor, "100000");
  assert.equal(
    (
      await pool.query(
        "select count(*) from public.institutional_seats where term_id=$1",
        [term.id],
      )
    ).rows[0].count,
    "0",
  );
  assert.equal(
    (
      await call("adminA", "approve_term", {
        id: term.id,
        approval_ref: "UNAUTHORIZED",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("operator", "activate_term", { id: term.id })).status,
    400,
  );
  await page
    .getByLabel("Manual approval reference")
    .fill("SYNTHETIC-APPROVED-001");
  await page
    .getByRole("button", { name: "Approve manually", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Activate term", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Activate term", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "activate term completed" })
    .waitFor();
  await page.getByLabel("Term", { exact: true }).selectOption(term.id);
  await page.getByLabel("Number of seats", { exact: true }).fill("2");
  await page
    .getByLabel("Code expiry (device time)", { exact: true })
    .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Issue batch", exact: true }).click();
  const delivery = page.getByLabel("One-time learner codes");
  await delivery.waitFor();
  const codes = (await delivery.inputValue()).split("\n");
  assert.equal(codes.length, 2);
  assert.match(codes[0], /^[a-f0-9]{64}$/);
  const batch = (
    await pool.query(
      "select * from public.institutional_batches where term_id=$1",
      [term.id],
    )
  ).rows[0];
  const retry = await call("adminA", "issue_batch", {
    id: batch.id,
    term_id: term.id,
    quantity: 2,
    expires_at: new Date(batch.code_expires_at).toISOString(),
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.replayed, true);
  assert.deepEqual(retry.body.codes, []);
  assert.equal(
    (
      await call("adminA", "issue_batch", {
        id: crypto.randomUUID(),
        term_id: term.id,
        quantity: 2,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      })
    ).status,
    409,
  );
  // Secrets cleared before screenshots. Never write codes to evidence, localStorage, URLs or logs.
  await page
    .getByRole("button", { name: "Clear displayed codes", exact: true })
    .click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await prepareScreenshot(page);
  await page.screenshot({
    path: evidence + "/operator-1280.png",
    fullPage: true,
  });
  await ctx.close();
  const mobile = await pageFor("adminA", 360);
  assert.equal(
    await mobile.page
      .getByRole("button", { name: "Create draft term", exact: true })
      .count(),
    0,
  );
  assert.ok(
    await mobile.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await prepareScreenshot(mobile.page);
  await mobile.page.screenshot({
    path: evidence + "/school-admin-360.png",
    fullPage: true,
  });
  await mobile.ctx.close();
  const learnerPage = await pageFor("learner", 360);
  await learnerPage.page.getByLabel("Learner access code").fill(codes[0]);
  await learnerPage.page
    .getByRole("button", { name: "Redeem school code", exact: true })
    .click();
  await learnerPage.page
    .getByRole("link", { name: "Open school mock revision", exact: true })
    .waitFor();
  assert.ok(
    await learnerPage.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await prepareScreenshot(learnerPage.page);
  await learnerPage.page.screenshot({
    path: evidence + "/learner-360.png",
    fullPage: true,
  });
  await learnerPage.page.setViewportSize({ width: 1280, height: 900 });
  await learnerPage.page.reload();
  await learnerPage.page
    .getByRole("link", { name: "Open school mock revision", exact: true })
    .waitFor();
  await prepareScreenshot(learnerPage.page);
  await learnerPage.page.screenshot({
    path: evidence + "/learner-1280.png",
    fullPage: true,
  });
  await learnerPage.ctx.close();
  const redeemed = await call("learner", "redeem", { code: codes[0] });
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.body.replayed, true);
  assert.equal(
    (await call("learner", "redeem", { code: codes[1] })).status,
    409,
  );
  assert.equal(
    ok(
      await actors.adminB.client
        .from("institutional_grants")
        .select("*")
        .eq("institution_id", a),
    ).length,
    0,
  );
  assert.equal(
    ok(await actors.learner.client.from("institutional_grants").select("*"))
      .length,
    1,
  );
  const trusted = await actors.learner.client.rpc("start_institutional_mock", {
    p_uid: actors.learner.id,
    p_institution_id: a,
    p_exam: "WAEC",
    p_subjects: ["Economics"],
    p_mode: "trusted",
    p_questions: [],
    p_request_id: crypto.randomUUID(),
  });
  assert.ok(
    trusted.error,
    "Clients cannot start trusted assessments or call service bridge",
  );
  const start = {
    action: "start",
    requestId: crypto.randomUUID(),
    exam: "WAEC",
    subjects: ["Economics"],
    mode: "full",
    institutionId: a,
  };
  const exam = await request("learner", "/api/mock-exams", start, a);
  assert.equal(exam.status, 200, JSON.stringify(exam.body));
  assert.ok(
    exam.body.questions.every(
      (q) => !("correctAnswer" in q) && !("explanation" in q),
    ),
  );
  const submitted = await request("learner", "/api/mock-exams", {
    action: "submit",
    attemptId: exam.body.id,
    answers: { [exam.body.questions[0].id]: "A" },
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.result.score, 1);
  assert.equal(
    (
      await request(
        "learner",
        "/api/mock-exams",
        { ...start, requestId: crypto.randomUUID() },
        a,
      )
    ).status,
    200,
    "School access supports another full formative mock",
  );
  assert.equal(
    ok(
      await actors.learner.client
        .from("quiz_results")
        .select("data")
        .eq("id", "mock:" + exam.body.id),
    ).length,
    1,
  );
  await pool.query(
    `update public.users set data=data||'{"subscription":"lifetime","proExpiresAt":null}' where id=$1`,
    [actors.learner.id],
  );
  const grant = redeemed.body.id;
  assert.equal(
    (
      await call("adminA", "suspend_grant", {
        id: grant,
        reason: "Synthetic suspension",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "learner",
        "/api/mock-exams",
        { ...start, requestId: crypto.randomUUID() },
        a,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call("adminA", "resume_grant", {
        id: grant,
        reason: "Unauthorized resume",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("operator", "resume_grant", {
        id: grant,
        reason: "Synthetic cleared",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("operator", "revoke_grant", {
        id: grant,
        reason: "Improper reassignment",
        reclaim: true,
      })
    ).status,
    400,
  );
  await command("adminA", "remove_from_cohort", a, {
    membership_id: learner,
    cohort_id: cohort,
  });
  assert.equal(
    (await request("learner", endpoint, null, a)).body.entitlement,
    null,
    "Same JWT loses access after cohort removal",
  );
  assert.equal(
    (
      await call("operator", "revoke_grant", {
        id: grant,
        reason: "Synthetic offboarded",
        reclaim: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("adminA", "cancel_batch", {
        id: batch.id,
        reason: "Synthetic cancel unused",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("learner", "redeem", { code: codes[1] })).status,
    409,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*) from public.institutional_seats where term_id=$1 and state=$2",
        [term.id, "available"],
      )
    ).rows[0].count,
    "3",
  );
  // Renewals are independent draft terms: no autocharge, no copied approval, no pre-start entitlement.
  const renewalId = crypto.randomUUID(),
    end = new Date(term.ends_at);
  assert.equal(
    (
      await call("operator", "draft_term", {
        id: renewalId,
        cohort_id: cohort,
        starts_at: end.toISOString(),
        ends_at: new Date(end.getTime() + 30 * 86400000).toISOString(),
        seat_cap: 4,
        quoted_minor: 200000,
        renewal_of: term.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await pool.query(
        "select state,approval_ref from public.institutional_terms where id=$1",
        [renewalId],
      )
    ).rows[0].approval_ref,
    null,
  );
  assert.equal(
    (
      await call("operator", "cancel_term", {
        id: term.id,
        reason: "Synthetic pilot ended",
      })
    ).status,
    200,
  );
  const profile = (
    await pool.query("select data from public.users where id=$1", [
      actors.learner.id,
    ])
  ).rows[0].data;
  assert.equal(profile.subscription, "lifetime");
  assert.equal(profile.proExpiresAt, null);
  assert.ok(profile.xp >= before.data.xp);
  assert.equal(
    (
      await request("learner", "/api/mock-exams", {
        ...start,
        requestId: crypto.randomUUID(),
        institutionId: undefined,
      })
    ).status,
    200,
    "Retail lifetime continues after school revocation",
  );
  const rawAudit = JSON.stringify(
    (
      await pool.query(
        "select * from public.institutional_license_events where institution_id=$1",
        [a],
      )
    ).rows,
  );
  for (const code of codes) assert.ok(!rawAudit.includes(code));
  const summary =
    "PASS: real Supabase Auth/PostgREST/RLS; two-school isolation; operator-only manual approval/activation; UI draft→approve→activate→bulk issue→single-use redeem; hash-only storage and safe retry; last-seat refusal; formative mock start/submit/scoring/history; suspension and live cohort revocation; explicit offboarding/reclaim; unused batch cancellation; new draft renewal; unchanged retail lifetime access. Responsive operator/admin/learner screenshots at 360px and 1280px. No learner codes in evidence. Synthetic accounts and questions only.\n";
  writeFileSync(evidence + "/summary.txt", summary);
  console.log(summary);
}
