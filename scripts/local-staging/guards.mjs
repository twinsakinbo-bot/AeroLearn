import assert from "node:assert/strict"
export const project = "aerolearn-windows-staging"
export const api = "http://127.0.0.1:55421"
export const site = "http://127.0.0.1:4323"
export function validateStatus(cfg) {
  assert.equal(
    cfg.API_URL,
    api,
    "Refusing non-local or unexpected Supabase API",
  )
  const db = new URL(cfg.DB_URL)
  assert.equal(db.hostname, "127.0.0.1")
  assert.equal(db.port, "55422")
  assert.equal(db.pathname, "/postgres")
  assert.equal(db.search, "", "Database URL overrides are prohibited")
  assert.equal(db.hash, "")
  assert.equal(db.username, "postgres")
  assert.equal(db.protocol, "postgresql:")
  assert.ok(cfg.ANON_KEY && cfg.SERVICE_ROLE_KEY, "Missing local credentials")
  return cfg
}
export function safeEnvironment(parent, cfg) {
  validateStatus(cfg)
  const env = Object.fromEntries(
    Object.entries(parent).filter(([key]) =>
      /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|programfiles|programfiles\(x86\)|number_of_processors|processor_architecture|lang|lc_all)$/i.test(
        key,
      ),
    ),
  )
  return {
    ...env,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: api,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: cfg.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: cfg.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: site,
    INSTITUTIONAL_MVP_ENABLED: "true",
    MOCK_DRAFT_REVIEW_ENABLED: "false",
    VERCEL_ENV: "preview",
  }
}
