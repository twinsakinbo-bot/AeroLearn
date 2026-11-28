// Free local acceptance preview only. Never accepts a hosted project.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
const cfg = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@3.4.0", "status", "-o", "json"], {
    encoding: "utf8",
  }),
)
assert.equal(cfg.API_URL, "http://127.0.0.1:54321")
assert.ok(
  !existsSync(".env.local"),
  "Refusing to overwrite existing environment",
)
const client = createClient(cfg.API_URL, cfg.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const email = "dan-acceptance@example.invalid",
  password = crypto.randomUUID() + "!aA9"
const { data, error } = await client.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})
if (error) throw error
const profile = await client
  .from("users")
  .select("data")
  .eq("id", data.user.id)
  .single()
if (profile.error) throw profile.error
const update = await client
  .from("users")
  .update({
    data: {
      ...profile.data.data,
      onboardingCompleted: true,
      learningMode: "exam",
      examType: "WAEC",
      subjects: ["Economics"],
      displayName: "Synthetic Dan acceptance",
      studyEmailsEnabled: false,
    },
  })
  .eq("id", data.user.id)
if (update.error) throw update.error
writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${cfg.API_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${cfg.ANON_KEY}\nSUPABASE_SERVICE_ROLE_KEY=${cfg.SERVICE_ROLE_KEY}\nNEXT_PUBLIC_SITE_URL=http://127.0.0.1:4322\nINSTITUTIONAL_MVP_ENABLED=true\nMOCK_DRAFT_REVIEW_ENABLED=false\n`,
  { mode: 0o600 },
)
writeFileSync(
  ".env.dan.local",
  `LOCAL TEST ONLY\nURL=http://127.0.0.1:4322/auth/login\nEMAIL=${email}\nPASSWORD=${password}\n`,
  { mode: 0o600 },
)
console.log(
  "Prepared local preview. Credentials are in gitignored .env.dan.local (mode 600). Run npm run dev -- --hostname 127.0.0.1 --port 4322. Draft Mathematics stays disabled.",
)
