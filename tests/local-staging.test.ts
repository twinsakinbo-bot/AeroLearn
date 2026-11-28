import test from "node:test"
import assert from "node:assert/strict"
// @ts-expect-error local executable JS helper has no declaration file
import {
  validateStatus,
  safeEnvironment,
} from "../scripts/local-staging/guards.mjs"
const local = {
  API_URL: "http://127.0.0.1:55421",
  DB_URL: "postgresql://postgres:local@127.0.0.1:55422/postgres",
  ANON_KEY: "local-public",
  SERVICE_ROLE_KEY: "local-secret",
}
test("local staging refuses hosted, alternate and disguised endpoints", () => {
  for (const API_URL of [
    "https://production.supabase.co",
    "http://127.0.0.1.evil.test:55421",
    "http://localhost:55421",
    "http://127.0.0.1:54321",
  ])
    assert.throws(() => validateStatus({ ...local, API_URL }))
  for (const DB_URL of [
    "postgresql://postgres:p@production.supabase.co:55422/postgres",
    "postgresql://postgres:p@127.0.0.1:54322/postgres",
    "postgresql://postgres:p@127.0.0.1:55422/postgres?host=production.supabase.co",
  ])
    assert.throws(() => validateStatus({ ...local, DB_URL }))
  assert.equal(validateStatus(local), local)
})
test("local app environment cannot inherit production credentials or Node injection", () => {
  const env = safeEnvironment(
    {
      PATH: "safe",
      SUPABASE_SERVICE_ROLE_KEY: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co",
      NODE_OPTIONS: "--require evil",
      COARENA_API_KEY: "paid",
      RESEND_API_KEY: "real",
      CRON_SECRET: "live",
      DATABASE_URL: "production",
    },
    local,
  )
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, "local-secret")
  assert.equal(env.MOCK_DRAFT_REVIEW_ENABLED, "false")
  for (const key of [
    "NODE_OPTIONS",
    "COARENA_API_KEY",
    "RESEND_API_KEY",
    "CRON_SECRET",
    "DATABASE_URL",
  ])
    assert.equal(env[key], undefined)
})
