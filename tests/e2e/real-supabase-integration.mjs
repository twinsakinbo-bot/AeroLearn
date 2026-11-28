/** Disposable local Supabase only: real GoTrue, PostgREST, JWTs, RLS and Next. */
import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { setTimeout as delay } from "node:timers/promises"
import { createClient } from "@supabase/supabase-js"
import pg from "pg"
import { chromium } from "@playwright/test"
const cfg = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@3.4.0", "status", "-o", "json"], {
    encoding: "utf8",
  }),
)
assert.match(cfg.API_URL, /^http:\/\/127\.0\.0\.1:59321$/)
assert.match(cfg.DB_URL, /@127\.0\.0\.1:59322\//)
const pool = new pg.Pool({ connectionString: cfg.DB_URL })
const admin = createClient(cfg.API_URL, cfg.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const actors = {}
let app, browser
let logs = ""
const base = "http://127.0.0.1:4324"
const evidence = "docs/evidence/integration"
mkdirSync(evidence, { recursive: true })
const ok = ({ data, error }) => {
  assert.equal(error, null, JSON.stringify(error))
  return data
}
try {
  for (const name of ["operator", "adminA", "adminB", "teacher", "learner", "retail"]) {
    const email = `integration-${name.toLowerCase()}@example.invalid`,
      password = crypto.randomUUID() + "!aA9"
    const existing = ok(await admin.auth.admin.listUsers()).users.find((u) => u.email === email)
    const user = ok(
      existing
        ? await admin.auth.admin.updateUserById(existing.id, { password })
        : await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          }),
    ).user
    await pool.query("update public.users set data=data || $2::jsonb where id=$1", [
      user.id,
      JSON.stringify({
        role: name === "operator" ? "admin" : "student",
        onboardingCompleted: true,
        learningMode: "exam",
        examType: "WAEC",
        subjects: ["Economics"],
        subscription: "free",
        xp: 0,
        coins: 0,
        inventory: [],
        displayName: "Synthetic " + name,
      }),
    ])
    const client = createClient(cfg.API_URL, cfg.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const session = ok(await client.auth.signInWithPassword({ email, password })).session
    assert.equal(ok(await client.auth.getUser()).user.id, user.id)
    actors[name] = { id: user.id, client, session }
  }
  await pool.query("update institutional_private.controls set enabled=true")
  await pool.query("insert into institutional_private.operators(user_id) values($1)", [actors.operator.id])
  const command = async (name, action, org, payload) =>
    ok(
      await actors[name].client.rpc("institutional_command", {
        p_action: action,
        p_institution_id: org,
        p_payload: payload,
      }),
    )
  const a = (
    await command("operator", "create_institution", null, {
      name: "Synthetic Integration A",
    })
  ).institution_id
  const b = (
    await command("operator", "create_institution", null, {
      name: "Synthetic Integration B",
    })
  ).institution_id
  for (const [name, org, role] of [
    ["adminA", a, "school_admin"],
    ["adminB", b, "school_admin"],
    ["teacher", a, "teacher"],
  ]) {
    const invite = await command("operator", "invite_staff", org, {
      email: actors[name].session.user.email,
      role,
    })
    const accepted = await command(name, "accept_invite", org, {
      token: invite.token,
    })
    actors[name].membership = accepted.id
  }
  const cohort = (await command("adminA", "create_cohort", a, { name: "Synthetic SS3" })).id
  const learner = (
    await command("operator", "enroll_learner", a, {
      user_id: actors.learner.id,
      alias: "SYN-001",
    })
  ).id
  for (const membership_id of [learner, actors.teacher.membership])
    await command("adminA", "assign_cohort", a, {
      membership_id,
      cohort_id: cohort,
    })
  assert.equal(ok(await actors.adminB.client.from("institutions").select("*").eq("id", a)).length, 0)
  assert.equal(ok(await actors.teacher.client.from("school_cohorts").select("*")).length, 1)
  assert.ok(
    (
      await actors.teacher.client.rpc("institutional_command", {
        p_action: "create_cohort",
        p_institution_id: a,
        p_payload: { name: "Escalation" },
      })
    ).error,
  )
  assert.equal(
    ok(await actors.retail.client.from("public_profiles").select("id").eq("id", actors.learner.id)).length,
    0,
  )
  assert.equal(
    ok(await actors.teacher.client.from("users").select("id").eq("id", actors.learner.id)).length,
    0,
  )
  await command("adminA", "revoke_member", a, { id: actors.teacher.membership })
  assert.equal(
    ok(await actors.teacher.client.from("school_cohorts").select("*")).length,
    0,
    "same JWT must lose scope immediately",
  )
  assert.ok(
    (
      await actors.retail.client
        .from("users")
        .update({ data: { lastMockExamDate: null } })
        .eq("id", actors.retail.id)
    ).error,
  )
  // Invented software fixtures only; reviewed Mathematics drafts stay out of bank.
  for (let i = 1; i <= 40; i++)
    await pool.query("insert into public.practice_questions(id,data) values($1,$2)", [
      `integration-econ-${i}`,
      {
        exam: "WAEC",
        subject: "Economics",
        year: 2026,
        question: `Synthetic workflow item ${i}: choose Correct`,
        options: { A: "Correct", B: "Other B", C: "Other C", D: "Other D" },
        correctAnswer: "A",
        explanation: "Synthetic test explanation: A is explicitly labelled Correct.",
        source: "Synthetic software fixture; not teaching content",
      },
    ])
  app = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "4324"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: cfg.API_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: cfg.ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: cfg.SERVICE_ROLE_KEY,
        INSTITUTIONAL_MVP_ENABLED: "true",
        MOCK_DRAFT_REVIEW_ENABLED: "true",
        VERCEL_ENV: "preview",
        RESEND_API_KEY: "",
        COARENA_API_KEY: "",
        AETHER_API_KEY: "",
        CRON_SECRET: "",
      },
    },
  )
  for (const stream of [app.stdout, app.stderr]) stream.on("data", (x) => (logs = (logs + x).slice(-20000)))
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base)).ok) break
    } catch {}
    await delay(500)
  }
  const request = async (name, path, body, org) => {
    const r = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${actors[name].session.access_token}`,
        "Content-Type": "application/json",
        ...(org ? { "X-Institution-Id": org } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json() }
  }
  assert.equal((await request("adminB", "/api/institutional", null, a)).status, 403)
  assert.equal((await request("learner", "/api/ai-quiz", {})).status, 403)
  assert.equal(
    (
      await request("retail", "/api/mock-exams", {
        action: "start",
        requestId: crypto.randomUUID(),
        exam: "WAEC",
        subjects: ["Mathematics"],
        mode: "draft_review",
      })
    ).status,
    403,
  )
  const start = {
    action: "start",
    requestId: crypto.randomUUID(),
    exam: "WAEC",
    subjects: ["Economics"],
    mode: "full",
  }
  const first = await request("retail", "/api/mock-exams", start)
  assert.equal(first.status, 200, JSON.stringify(first))
  assert.equal(first.body.questions.length, 40)
  assert.equal((await request("retail", "/api/mock-exams", start)).body.id, first.body.id)
  assert.ok(first.body.questions.every((q) => !("correctAnswer" in q) && !("explanation" in q)))
  const submission = {
    action: "submit",
    attemptId: first.body.id,
    answers: { [first.body.questions[0].id]: "A" },
  }
  const saved = await Promise.all([
    request("retail", "/api/mock-exams", submission),
    request("retail", "/api/mock-exams", submission),
  ])
  assert.ok(
    saved.every((x) => x.status === 200 && x.body.result.score === 1 && x.body.result.totalQuestions === 40),
  )
  assert.equal((await request("adminB", "/api/mock-exams", submission)).status, 403)
  assert.equal(
    ok(
      await actors.adminB.client
        .from("quiz_results")
        .select("id")
        .eq("id", "mock:" + first.body.id),
    ).length,
    0,
  )
  const profile = ok(
    await actors.retail.client.from("users").select("data").eq("id", actors.retail.id).single(),
  ).data
  assert.equal(profile.totalQuestionsAnswered, 40)
  assert.equal(profile.totalQuestionsCorrect, 1)
  assert.equal(profile.xp, 5)
  // Real API and PostgREST security boundaries, synthetic content only.
  const exposed = ok(await actors.retail.client.from("practice_questions").select("data").limit(1))
  assert.ok(exposed[0].data.correctAnswer, "Public formative keys must be acknowledged")
  const rpcExposed = ok(await actors.retail.client.rpc("doc_query", { p_table: "practice_questions" }))
  assert.ok(
    rpcExposed.some((q) => q.data.correctAnswer),
    "Document reads expose revision keys",
  )
  assert.ok(
    (await actors.retail.client.schema("mock_private").from("assessment_questions").select("*")).error,
  )
  assert.ok(
    (
      await actors.retail.client.rpc("retail_reward", {
        p_uid: actors.retail.id,
        p_action: "lesson",
        p_payload: {},
      })
    ).error,
  )
  const privateQuestion = {
    exam: "WAEC",
    subject: "Economics",
    publicationStatus: "approved",
    question: "Synthetic hidden assessment",
    options: { A: "One", B: "Two", C: "Three", D: "Four" },
    correctAnswer: "B",
    explanation: "Private test solution",
  }
  await pool.query("insert into mock_private.assessment_questions(id,data) values($1,$2)", [
    "real-private-key",
    privateQuestion,
  ])
  const trusted = ok(
    await admin.rpc("start_mock_attempt", {
      p_uid: actors.learner.id,
      p_exam: "WAEC",
      p_subjects: ["Economics"],
      p_mode: "trusted",
      p_questions: [{ ...privateQuestion, id: "real-private-key" }],
      p_pro: true,
    }),
  )
  assert.equal(
    (
      await request("learner", "/api/mock-exams", {
        action: "checkpoint",
        attemptId: trusted.id,
        answers: { "real-private-key": "B" },
      })
    ).status,
    200,
  )
  await pool.query(
    "update mock_private.attempts set started_at=clock_timestamp()-interval '70 seconds' where id=$1",
    [trusted.id],
  )
  assert.equal(
    (
      await request("learner", "/api/mock-exams", {
        action: "checkpoint",
        attemptId: trusted.id,
        answers: { "real-private-key": "A" },
      })
    ).status,
    409,
  )
  const recovered = await request("learner", "/api/mock-exams", {
    action: "submit",
    attemptId: trusted.id,
    answers: { "real-private-key": "A" },
  })
  assert.equal(recovered.body.result.score, 1)
  assert.equal(recovered.body.result.timing, "recovered")
  assert.equal(recovered.body.result.reportEligible, true)
  const sessionId = crypto.randomUUID()
  ok(
    await admin.rpc("register_practice_session", {
      p_uid: actors.adminB.id,
      p_id: sessionId,
      p_questions: [{ id: "q1", subject: "Economics", correctAnswer: "B" }],
    }),
  )
  const reward = { action: "practice", payload: { session: sessionId, question: "q1", answer: "B" } }
  assert.equal((await request("adminB", "/api/gamification/reward", reward)).body.xp, 10)
  assert.equal((await request("adminB", "/api/gamification/reward", reward)).body.duplicate, true)
  assert.equal((await request("retail", "/api/gamification/reward", reward)).status, 400)
  assert.ok(
    (
      await actors.adminB.client
        .from("users")
        .update({ data: { coins: 99999 } })
        .eq("id", actors.adminB.id)
    ).error,
  )
  console.log(
    "Real PostgREST key exposure/private denial, deadline checkpoint recovery and validated retail reward API passed.",
  )
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
  for (const width of [360, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    await ctx.addCookies([
      {
        name: "sb-127-auth-token",
        value: "base64-" + Buffer.from(JSON.stringify(actors.retail.session)).toString("base64url"),
        domain: "127.0.0.1",
        path: "/",
      },
    ])
    const page = await ctx.newPage()
    page.setDefaultTimeout(60000)
    await page.goto(base + "/app/progress")
    await page.getByText("WAEC · Economics · 1/40", { exact: false }).first().waitFor()
    await page.reload()
    await page.getByText("WAEC · Economics · 1/40", { exact: false }).first().click()
    await page.getByText("Synthetic test explanation:", { exact: false }).first().waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({
      path: `${evidence}/real-history-${width}.png`,
      fullPage: true,
    })
    await ctx.close()
  }
  const summary =
    "PASS: real local Supabase GoTrue password sign-in and getUser; PostgREST JWT/RLS; two-school isolation; teacher privilege denial and immediate revocation with same JWT; learner privacy and AI safeguards; protected mock allowance; student draft denial; real Next start/retry; 40-question scoring; concurrent exactly-once persistence; foreign attempt/result denial; progress and worked history reload at 360px/1280px.\nSynthetic data only. Hosted project creation refused by free two-project limit; no hosted preview. Mathematics remains draft.\n"
  writeFileSync(`${evidence}/real-supabase-summary.txt`, summary)
  console.log(summary)
} catch (error) {
  console.error(error)
  console.error(logs)
  process.exitCode = 1
} finally {
  await browser?.close()
  app?.kill("SIGTERM")
  await pool.end()
}
