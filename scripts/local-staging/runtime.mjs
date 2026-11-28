import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  readdirSync,
} from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"
import pg from "pg"
import {
  api,
  site,
  project,
  validateStatus,
  safeEnvironment,
} from "./guards.mjs"
const root = resolve(import.meta.dirname, "../.."),
  dir = resolve(root, ".local-staging"),
  runtime = resolve(dir, "runtime")
process.chdir(root)
assert.equal(
  execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim(),
  "integration/p0-a-waec-staging",
  "Use the integration branch",
)
for (const name of readdirSync(root)) {
  if (/^\.env($|\.)/.test(name) && name !== ".env.example")
    throw Error("Use a fresh checkout without environment files: " + name)
}
assert.ok(
  !existsSync("supabase/.temp/project-ref"),
  "Refusing a checkout linked to a hosted Supabase project",
)
const action = process.argv[2]
if (action === "init") {
  mkdirSync(resolve(runtime, "supabase"), { recursive: true })
  const config = {
    project_id: project,
    api: {
      enabled: true,
      port: 55421,
      schemas: ["public"],
      extra_search_path: ["public", "extensions"],
      max_rows: 1000,
    },
    db: {
      port: 55422,
      shadow_port: 55420,
      major_version: 17,
      seed: { enabled: false },
    },
    auth: {
      enabled: true,
      site_url: site,
      additional_redirect_urls: [site + "/auth/callback"],
      enable_signup: false,
      email: { enabled: true },
    },
    local_smtp: {
      enabled: true,
      port: 55424,
      smtp_port: 55425,
      pop3_port: 55426,
    },
    studio: { enabled: false },
    analytics: { enabled: false },
    storage: { enabled: true },
    edge_runtime: { enabled: false },
    realtime: { enabled: false },
  }
  writeFileSync(
    resolve(runtime, "supabase/config.jsonc"),
    JSON.stringify(config, null, 2) + "\n",
  )
  cpSync("supabase/migrations", resolve(runtime, "supabase/migrations"), {
    recursive: true,
  })
  console.log("Prepared isolated runtime " + runtime)
  process.exit(0)
}
assert.ok(
  existsSync(resolve(runtime, "supabase/config.jsonc")),
  "Run Setup first",
)
const config = JSON.parse(
  readFileSync(resolve(runtime, "supabase/config.jsonc"), "utf8"),
)
assert.equal(config.project_id, project)
assert.equal(config.api.port, 55421)
assert.equal(config.db.port, 55422)
assert.ok(
  !existsSync(resolve(runtime, "supabase/.temp/project-ref")),
  "Hosted links are prohibited",
)
const cfg = validateStatus(
  JSON.parse(
    execFileSync(
      process.env.LOCAL_SUPABASE_EXE || "supabase",
      ["--workdir", runtime, "status", "-o", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  ),
)
if (action === "start") {
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "4323",
    ],
    { stdio: "inherit", env: safeEnvironment(process.env, cfg) },
  )
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal))
  child.on("exit", (code) => process.exit(code || 0))
} else if (action === "seed") {
  const pool = new pg.Pool({ connectionString: cfg.DB_URL })
  try {
    const admin = createClient(api, cfg.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const accounts = {}
    const ok = (r) => {
      if (r.error) throw Error(r.error.message)
      return r.data
    }
    const previous = ok(
      await admin.auth.admin.listUsers({ perPage: 1000 }),
    ).users
    for (const role of [
      "operator",
      "schoolAdminA",
      "schoolAdminB",
      "teacherA",
      "teacherB",
      "learnerA",
      "learnerB",
      "dan",
    ]) {
      const email = `local-${role.toLowerCase()}@example.invalid`,
        password = crypto.randomUUID() + "!aA9",
        old = previous.find((u) => u.email === email)
      const user = ok(
        old
          ? await admin.auth.admin.updateUserById(old.id, { password })
          : await admin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
            }),
      ).user
      await pool.query(
        `update public.users set data=data || $2::jsonb where id=$1`,
        [
          user.id,
          JSON.stringify({
            role: role === "operator" ? "admin" : "student",
            displayName: "Synthetic " + role,
            onboardingCompleted: true,
            studyEmailsEnabled: false,
            learningMode: "exam",
            examType: "WAEC",
            subjects: ["Economics"],
          }),
        ],
      )
      accounts[role] = { email, password, id: user.id }
    }
    await pool.query("update institutional_private.controls set enabled=true")
    await pool.query(
      "insert into institutional_private.operators(user_id) values($1) on conflict do nothing",
      [accounts.operator.id],
    )
    const schools = {}
    for (const school of ["A", "B"]) {
      let org = (
        await pool.query("select id from public.institutions where name=$1", [
          "LOCAL SYNTHETIC SCHOOL " + school,
        ])
      ).rows[0]?.id
      if (!org)
        org = (
          await pool.query(
            "insert into public.institutions(name) values($1) returning id",
            ["LOCAL SYNTHETIC SCHOOL " + school],
          )
        ).rows[0].id
      let cohort = (
        await pool.query(
          "select id from public.school_cohorts where institution_id=$1 and name=$2",
          [org, "Synthetic SS3"],
        )
      ).rows[0]?.id
      if (!cohort)
        cohort = (
          await pool.query(
            "insert into public.school_cohorts(institution_id,name) values($1,$2) returning id",
            [org, "Synthetic SS3"],
          )
        ).rows[0].id
      const members = {}
      for (const [key, role] of [
        ["schoolAdmin", "school_admin"],
        ["teacher", "teacher"],
        ["learner", "learner"],
      ]) {
        const actor = accounts[key + school]
        const member = (
          await pool.query(
            `insert into public.institution_memberships(institution_id,user_id,role,alias) values($1,$2,$3,$4) on conflict(institution_id,user_id) do update set active=true,alias=excluded.alias returning id`,
            [org, actor.id, role, role === "learner" ? "SYN-" + school : null],
          )
        ).rows[0].id
        if (role === "learner")
          await pool.query(
            "insert into institutional_private.protected_learners values($1) on conflict do nothing",
            [actor.id],
          )
        if (role !== "school_admin")
          await pool.query(
            "insert into public.cohort_memberships values($1,$2,$3) on conflict do nothing",
            [org, cohort, member],
          )
        members[key] = member
      }
      schools[school] = { institution_id: org, cohort_id: cohort, members }
    }
    for (let i = 1; i <= 40; i++)
      await pool.query(
        "insert into public.practice_questions(id,data) values($1,$2) on conflict(id) do nothing",
        [
          `windows-synthetic-econ-${i}`,
          {
            exam: "WAEC",
            subject: "Economics",
            year: 2026,
            question: `SYNTHETIC SOFTWARE TEST ${i}: choose the option labelled Correct.`,
            options: {
              A: "Correct",
              B: "Distractor B",
              C: "Distractor C",
              D: "Distractor D",
            },
            correctAnswer: "A",
            explanation:
              "Software fixture only: option A is explicitly labelled Correct. This is not a curriculum question.",
            source: "Synthetic acceptance fixture; not teaching material",
            publicationStatus: "approved",
          },
        ],
      )
    writeFileSync(
      resolve(dir, "accounts.json"),
      JSON.stringify(
        {
          warning: "LOCAL SYNTHETIC ONLY. Do not share or commit passwords.",
          accounts,
          schools,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    )
    writeFileSync(
      resolve(dir, "environment.json"),
      JSON.stringify(safeEnvironment({}, cfg), null, 2),
      { mode: 0o600 },
    )
    console.log(
      "Synthetic schools/accounts ready. Passwords: .local-staging/accounts.json. Environment: .local-staging/environment.json. Mathematics drafts remain excluded.",
    )
  } finally {
    await pool.end()
  }
} else if (action === "check")
  console.log(
    "Verified local API/DB endpoints, runtime identity and absence of hosted links. Draft review is disabled at startup.",
  )
else throw Error("Unknown action")
