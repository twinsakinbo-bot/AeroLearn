/** Local Next.js -> local Auth/PostgREST adapter -> real disposable PostgreSQL.
 * Auth is simulated; SQL, API handlers, RLS, React UI and persistence are real.
 * No hosted services, real accounts, imported exam content, or provider calls.
 */
import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs"
import http from "node:http"
import { setTimeout as delay } from "node:timers/promises"
import pg from "pg"
import { chromium } from "@playwright/test"
const container = `aerolearn-pilot-e2e-${process.pid}`
const reviewer = "e0000000-0000-4000-8000-000000000001",
  student = "e0000000-0000-4000-8000-000000000002",
  other = "e0000000-0000-4000-8000-000000000003"
const publicKey = "synthetic-public-key",
  serviceKey = "synthetic-service-key"
const tokenExpiry = Math.floor(Date.now() / 1000) + 3600
const tokenFor = (id) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: tokenExpiry, role: "authenticated" })).toString("base64url")}.synthetic-signature`
const knownTokens = new Map([reviewer, student, other].map((id) => [tokenFor(id), id]))
const evidence = "docs/evidence/pilot"
mkdirSync(evidence, { recursive: true })
let pool, backend, app, browser
let appLogs = ""
const adapterErrors = []
try {
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--name",
      container,
      "-e",
      "POSTGRES_PASSWORD=synthetic-only",
      "-p",
      "127.0.0.1::5432",
      "postgres:17-alpine",
    ],
    { stdio: "pipe" },
  )
  const dbPort = Number(
    execFileSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" }).trim().split(":").pop(),
  )
  pool = new pg.Pool({
    host: "127.0.0.1",
    port: dbPort,
    user: "postgres",
    password: "synthetic-only",
    database: "postgres",
  })
  for (let i = 0; i < 60; i++) {
    try {
      await pool.query("select 1")
      break
    } catch {
      await delay(250)
    }
  }
  await pool.query(readFileSync("tests/fixtures/supabase-bootstrap.sql", "utf8"))
  for (const file of readdirSync("supabase/migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    await pool.query(readFileSync(`supabase/migrations/${file}`, "utf8"))
  // Supabase default service-role grants (BYPASSRLS itself is not a table grant).
  await pool.query("grant all on all tables in schema public to service_role")
  for (const [id, role] of [
    [reviewer, "admin"],
    [student, "student"],
    [other, "student"],
  ]) {
    await pool.query("insert into auth.users(id,email) values($1,$2)", [
      id,
      `${role}-${id.slice(-1)}@example.invalid`,
    ])
    await pool.query("update public.users set data=data || $2::jsonb where id=$1", [
      id,
      JSON.stringify({
        role,
        displayName: "Synthetic reviewer",
        onboardingCompleted: true,
        learningMode: "exam",
        examType: "WAEC",
        subjects: ["Mathematics"],
        subscription: "free",
        xp: 0,
        coins: 0,
        streak: 0,
        inventory: [],
      }),
    ])
  }
  // Synthetic Economics fixtures, deliberately no explanation to test the honest fallback.
  for (let i = 1; i <= 40; i++)
    await pool.query("insert into public.practice_questions(id,data) values($1,$2)", [
      `synthetic-econ-${i}`,
      {
        exam: "WAEC",
        subject: "Economics",
        year: 2026,
        question: `Synthetic economics workflow item ${i}: which option is labelled Correct?`,
        options: { A: "Correct", B: "Distractor 1", C: "Distractor 2", D: "Distractor 3" },
        correctAnswer: "A",
        source: "Synthetic software test fixture; not curriculum content",
      },
    ])
  backend = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*")
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization, apikey, content-type, x-client-info, prefer, range, accept",
    )
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,PATCH")
    res.setHeader("Content-Type", "application/json")
    if (req.method === "OPTIONS") {
      res.end()
      return
    }
    const token = req.headers.authorization?.replace(/^Bearer /, "")
    const id = knownTokens.get(token),
      service = token === serviceKey
    if (req.url === "/auth/v1/user") {
      if (!id) {
        res.statusCode = 401
        res.end(JSON.stringify({ message: "Invalid synthetic token" }))
        return
      }
      res.end(
        JSON.stringify({
          id,
          email: `synthetic@example.invalid`,
          aud: "authenticated",
          role: "authenticated",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          user_metadata: {},
        }),
      )
      return
    }
    if (!id && !service) {
      res.statusCode = 401
      res.end("{}")
      return
    }
    let conn
    try {
      let raw = ""
      for await (const chunk of req) raw += chunk
      const args = raw ? JSON.parse(raw) : {},
        url = new URL(req.url, "http://local")
      conn = await pool.connect()
      await conn.query("begin")
      await conn.query(`set local role ${service ? "service_role" : "authenticated"}`)
      await conn.query("select set_config('request.jwt.claim.sub',$1,true)", [id || ""])
      let result
      if (url.pathname === "/rest/v1/rpc/doc_query")
        result = (
          await conn.query("select * from public.doc_query($1,$2,$3,$4,$5,$6,$7)", [
            args.p_table,
            args.p_parent,
            JSON.stringify(args.p_filters),
            JSON.stringify(args.p_orders),
            args.p_limit,
            args.p_after == null ? null : JSON.stringify(args.p_after),
            args.p_count_only,
          ])
        ).rows
      else if (url.pathname === "/rest/v1/rpc/doc_patch")
        result = (
          await conn.query("select * from public.doc_patch($1,$2,$3,$4,$5,$6,$7,$8)", [
            args.p_table,
            args.p_id,
            args.p_parent,
            JSON.stringify(args.p_set),
            JSON.stringify(args.p_ops),
            args.p_replace,
            args.p_expected_version,
            args.p_require_exists,
          ])
        ).rows
      else if (url.pathname === "/rest/v1/rpc/start_mock_attempt")
        result = (
          await conn.query("select public.start_mock_attempt($1,$2,$3,$4,$5,$6,$7) as result", [
            args.p_uid,
            args.p_exam,
            JSON.stringify(args.p_subjects),
            args.p_mode,
            JSON.stringify(args.p_questions),
            args.p_pro,
            args.p_request_id,
          ])
        ).rows[0].result
      else if (url.pathname === "/rest/v1/rpc/checkpoint_mock_attempt")
        result = (
          await conn.query("select public.checkpoint_mock_attempt($1,$2,$3) as result", [
            args.p_uid,
            args.p_attempt,
            JSON.stringify(args.p_answers),
          ])
        ).rows[0].result
      else if (url.pathname === "/rest/v1/rpc/submit_mock_attempt")
        result = (
          await conn.query("select public.submit_mock_attempt($1,$2,$3) as result", [
            args.p_uid,
            args.p_attempt,
            JSON.stringify(args.p_answers),
          ])
        ).rows[0].result
      else if (url.pathname === "/rest/v1/mock_question_bank")
        result = (
          await conn.query(
            "select id,data from public.mock_question_bank where exam_key=$1 order by id limit $2 offset $3",
            [
              url.searchParams.get("exam_key")?.replace(/^eq\./, ""),
              Number(url.searchParams.get("limit") || 500),
              Number(url.searchParams.get("offset") || 0),
            ],
          )
        ).rows
      else if (url.pathname === "/rest/v1/users") {
        const rows = (
          await conn.query("select id,data,version from public.users where id=$1", [
            url.searchParams.get("id")?.replace(/^eq\./, ""),
          ])
        ).rows
        result = req.headers.accept?.includes("application/vnd.pgrst.object+json") ? (rows[0] ?? null) : rows
      } else throw new Error(`Unexpected adapter route: ${req.method} ${url.pathname}`)
      await conn.query("commit")
      res.end(JSON.stringify(result))
    } catch (error) {
      if (conn) await conn.query("rollback")
      res.statusCode = error.code === "42501" ? 403 : 400
      res.end(JSON.stringify({ code: error.code || "TEST_ERROR", message: error.message }))
      if (!error.code) adapterErrors.push(error.message)
    } finally {
      conn?.release()
    }
  })
  await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve))
  const apiUrl = `http://127.0.0.1:${backend.address().port}`,
    port = 4321,
    base = `http://127.0.0.1:${port}`
  app = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_SUPABASE_URL: apiUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        MOCK_DRAFT_REVIEW_ENABLED: "true",
        VERCEL_ENV: "preview",
        RESEND_API_KEY: "",
        GROQ_API_KEY: "",
        COARENA_API_KEY: "",
        AETHER_API_KEY: "",
      },
    },
  )
  app.stdout.on("data", (v) => {
    appLogs = (appLogs + v).slice(-40000)
  })
  app.stderr.on("data", (v) => {
    appLogs = (appLogs + v).slice(-40000)
  })
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw Error(appLogs)
    try {
      if ((await fetch(base)).ok) break
    } catch {}
    await delay(500)
  }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
  const contexts = []
  const api = async (id, body) => {
    const r = await fetch(`${base}/api/mock-exams`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFor(id)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body.action === "start" ? { requestId: crypto.randomUUID(), ...body } : body),
    })
    return { status: r.status, body: await r.json() }
  }
  assert.equal(
    (await api(student, { action: "start", exam: "WAEC", subjects: ["Mathematics"], mode: "draft_review" }))
      .status,
    403,
    "Students cannot load drafts",
  )
  assert.equal(
    (await api(student, { action: "start", exam: "WAEC", subjects: ["Mathematics"], mode: "revision" }))
      .status,
    409,
    "Missing bank must not silently substitute draft",
  )
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    contexts.push(context)
    const session = {
      access_token: tokenFor(reviewer),
      refresh_token: "synthetic-refresh",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: {
        id: reviewer,
        email: "reviewer@example.invalid",
        aud: "authenticated",
        role: "authenticated",
        user_metadata: {},
      },
    }
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
        domain: "127.0.0.1",
        path: "/",
      },
    ])
    // Unrelated daily-login rewards are excluded from the mock workflow assertion.
    await context.route("**/api/gamification/login", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ updated: false, streak: 0, coins: 0, inventory: [] }),
      }),
    )
    const page = await context.newPage()
    page.setDefaultTimeout(45000)
    await page.goto(`${base}/app/mock-exams`)
    await page.getByLabel("Exam type", { exact: true }).selectOption("WAEC")
    await page.getByRole("button", { name: "Mathematics Unavailable", exact: true }).waitFor()
    assert.equal(
      await page.getByRole("button", { name: "Mathematics Unavailable", exact: true }).isDisabled(),
      true,
    )
    await page.screenshot({ path: `${evidence}/availability-${width}.png`, fullPage: true })
    await page.getByRole("button", { name: "Review draft Mathematics" }).click()
    await page.getByText("Question 1 of 8", { exact: false }).waitFor()
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `Draft overflow at ${width}`,
    )
    await page.screenshot({ path: `${evidence}/active-${width}.png`, fullPage: true })
    await page.getByRole("button", { name: "C 5", exact: true }).click()
    await page.getByRole("button", { name: "Submit exam", exact: true }).click()
    await page.getByRole("dialog", { name: "Submit exam?" }).waitFor()
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      "Keep working",
      "Dialog initially focuses cancel",
    )
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Submit exam", exact: true }).click()
    // Explicit manual-button path, rather than browser-native dialog interception.
    await page.getByRole("button", { name: "Keep working" }).click()
    await page.getByRole("button", { name: "Submit exam", exact: true }).click()
    await page.screenshot({ path: `${evidence}/confirmation-${width}.png`, fullPage: false })
    // First submission fails at transport. Answers and attempt ID must survive retry.
    let failOnce = true
    await page.route("**/api/mock-exams", async (route) => {
      const body = route.request().postDataJSON()
      if (body?.action === "submit" && failOnce) {
        failOnce = false
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"Synthetic network failure; retry submission."}',
        })
        return
      }
      await route.continue()
    })
    await page.getByRole("button", { name: "Confirm submission" }).click()
    await page.getByRole("alert").filter({ hasText: "Synthetic network failure" }).waitFor()
    await page.getByRole("button", { name: "Retry submission" }).click()
    await page.getByRole("button", { name: "Confirm submission" }).click()
    await page.getByRole("heading", { name: "1 of 8 correct" }).waitFor()
    assert.equal(
      await page.getByText("Worked explanation:", { exact: true }).count(),
      8,
      "All answers, including correct, need worked review",
    )
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `Results overflow at ${width}`,
    )
    await page.screenshot({ path: `${evidence}/results-${width}.png`, fullPage: true })
    await page.getByRole("link", { name: "View progress and history" }).click()
    await page.getByText("WAEC · Mathematics · 1/8", { exact: false }).first().waitFor()
    await page.reload()
    await page.getByText("WAEC · Mathematics · 1/8", { exact: false }).first().click()
    await page.getByText("3(2x", { exact: false }).first().waitFor()
    await page.screenshot({ path: `${evidence}/history-${width}.png`, fullPage: true })
    console.log(
      `${width}px: unavailable bank, draft 8-question activity, answer, cancel/confirm, failed-save retry, 1/8 score, all explanations and history reload passed.`,
    )
  }
  const unchanged = (await pool.query("select data from public.users where id=$1", [reviewer])).rows[0].data
  assert.equal(unchanged.xp, 0)
  assert.equal(unchanged.coins, 0)
  assert.equal(unchanged.lastMockExamDate, undefined)
  // Real browser path for the full 40-question bank, with honest missing-explanation copy.
  const economicsPage = await contexts[0].newPage()
  economicsPage.setDefaultTimeout(45000)
  await economicsPage.goto(`${base}/app/mock-exams`)
  await economicsPage.getByLabel("Exam type", { exact: true }).selectOption("WAEC")
  await economicsPage
    .getByRole("button", { name: "Economics 40 available · 0 with explanations", exact: true })
    .click()
  let loseStartResponse = true
  await economicsPage.route("**/api/mock-exams", async (route) => {
    const body = route.request().postDataJSON()
    if (body?.action === "start" && loseStartResponse) {
      loseStartResponse = false
      const received = await route.fetch()
      assert.equal(received.status(), 200)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Synthetic lost start response; retry."}',
      })
      return
    }
    await route.continue()
  })
  await economicsPage.getByRole("button", { name: "Start exam", exact: true }).click()
  await economicsPage.getByRole("alert").filter({ hasText: "Synthetic lost start response" }).waitFor()
  await economicsPage.getByRole("button", { name: "Start exam", exact: true }).click()
  await economicsPage.getByText("Question 1 of 40", { exact: false }).waitFor()
  await economicsPage.getByRole("button", { name: "A Correct", exact: true }).click()
  // Freeze the last acknowledged checkpoint, then simulate a server deadline
  // passing while the browser clock still shows time. Later edits must not score.
  let backedUp
  for (let i = 0; i < 100; i++) {
    backedUp = (
      await pool.query(
        "select id,checkpoint from mock_private.attempts where user_id=$1 and mode='full' order by started_at desc limit 1",
        [reviewer],
      )
    ).rows[0]
    if (Object.values(backedUp.checkpoint).includes("A")) break
    await delay(100)
  }
  assert.ok(Object.values(backedUp.checkpoint).includes("A"), "Server answer checkpoint was not saved")
  await pool.query(
    "update mock_private.attempts set started_at=clock_timestamp()-duration_seconds*interval '1 second'-interval '10 seconds' where id=$1",
    [backedUp.id],
  )
  await economicsPage.getByRole("button", { name: "B Distractor 1", exact: true }).click()
  await economicsPage.getByRole("button", { name: "Submit exam", exact: true }).click()
  await economicsPage.getByRole("button", { name: "Confirm submission" }).click()
  await economicsPage.getByRole("heading", { name: "1 of 40 correct" }).waitFor()
  await economicsPage.getByText("The server deadline passed.", { exact: false }).waitFor()
  assert.equal(
    await economicsPage
      .getByText("A worked explanation is not available for this imported question.", { exact: false })
      .count(),
    40,
  )
  await economicsPage.screenshot({ path: `${evidence}/economics-results-1280.png`, fullPage: false })
  // Expiry auto-submits once using a simulated browser wall clock, not a long sleep.
  await economicsPage.goto(`${base}/app/mock-exams`)
  await economicsPage.getByRole("button", { name: "Review draft Mathematics" }).click()
  await economicsPage.getByText("Question 1 of 8", { exact: false }).waitFor()
  await economicsPage.clock.install()
  await economicsPage.clock.fastForward(481000)
  await economicsPage.getByRole("heading", { name: "0 of 8 correct" }).waitFor()
  console.log("Browser 40-question Economics submit/review and draft timer-expiry auto-submit passed.")
  // Exercise the 40-question workflow and its real database idempotency concurrently.
  const full = await api(student, { action: "start", exam: "WAEC", subjects: ["Economics"], mode: "full" })
  assert.equal(full.status, 200)
  assert.equal(full.body.questions.length, 40)
  assert.equal(full.body.durationSeconds, 2400)
  assert.ok(full.body.questions.every((q) => !("correctAnswer" in q) && !("explanation" in q)))
  const body = { action: "submit", attemptId: full.body.id, answers: { [full.body.questions[0].id]: "A" } }
  const results = await Promise.all([api(student, body), api(student, body)])
  assert.ok(
    results.every(
      (r) => r.status === 200 && r.body.result.score === 1 && r.body.result.totalQuestions === 40,
    ),
  )
  assert.equal((await api(other, body)).status, 403)
  const saved = (await pool.query("select data from public.users where id=$1", [student])).rows[0].data
  assert.equal(saved.xp, 5)
  assert.equal(saved.coins, 2)
  assert.equal(saved.totalQuestionsAnswered, 40)
  assert.equal(saved.totalQuestionsCorrect, 1)
  const lastMock = saved.lastMockExamDate
  assert.equal(
    (await api(student, { action: "start", exam: "WAEC", subjects: ["Economics"], mode: "full" })).status,
    429,
  )
  const short = await api(student, {
    action: "start",
    exam: "WAEC",
    subjects: ["Economics"],
    mode: "revision",
  })
  assert.equal(short.body.questions.length, 8)
  assert.equal(
    (await pool.query("select data->>'lastMockExamDate' as last from public.users where id=$1", [student]))
      .rows[0].last,
    lastMock,
  )
  assert.deepEqual(adapterErrors, [])
  console.log(
    "40-question Economics: 40-minute timer, one answer, concurrent submissions, 1/40 score, one reward/progress update, foreign denial and independent short-mode allowance passed.",
  )
  for (const context of contexts) await context.close()
  try {
    const { unlinkSync } = await import("node:fs")
    unlinkSync(`${evidence}/last-error.txt`)
  } catch {}
  writeFileSync(
    `${evidence}/e2e-summary.txt`,
    "PASS: 1280px and 360px UI; draft exclusion; missing bank; 8-question draft; explicit dialog cancel/confirm; save failure/retry; correct/unanswered scoring; eight explanations; persisted history reload.\nPASS: 40-question/40-minute synthetic Economics, concurrent idempotent submit, cross-user denial, exact progress/rewards, full weekly allowance and independent 8-question short revision.\nAuth and PostgREST transport are local adapters; PostgreSQL SQL/RLS, Next handlers, React UI and persistence are real. Hosted Supabase Auth and real Test-account rehearsal remain unverified. No production writes, provider calls or email.\n",
  )
} catch (error) {
  writeFileSync(`${evidence}/last-error.txt`, String(error) + "\n" + appLogs)
  throw error
} finally {
  await browser?.close()
  if (app) {
    app.kill("SIGTERM")
    await new Promise((resolve) => (app.exitCode !== null ? resolve() : app.once("exit", resolve)))
  }
  await new Promise((resolve) => (backend ? backend.close(resolve) : resolve()))
  await pool?.end()
  try {
    execFileSync("docker", ["rm", "-f", "-v", container], { stdio: "ignore" })
  } catch {}
}
