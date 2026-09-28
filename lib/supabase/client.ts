/**
 * The browser-side Supabase client.
 *
 * One instance per tab, created on first use rather than at import time. That
 * matters: `lib/db.ts` and `lib/auth.ts` are imported by client components that
 * Next prerenders during `next build`, and a client constructed at module scope
 * would run — and throw on missing env vars — in that prerender pass.
 *
 * Uses `createBrowserClient` from @supabase/ssr rather than the plain
 * `createClient`, because it stores the session in cookies instead of
 * localStorage. Route handlers can then read the same session server-side.
 */
import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

/** Set in `.env.local`. See SUPABASE_SETUP.md for where to find them. */
const URL_KEY = "NEXT_PUBLIC_SUPABASE_URL"
const ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY"

export class SupabaseConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `Supabase is not configured — missing ${missing.join(" and ")} in .env.local. ` +
        `See SUPABASE_SETUP.md for the three values and where to copy them from.`,
    )
    this.name = "SupabaseConfigError"
  }
}

let browserClient: SupabaseClient | null = null

/**
 * The client for anything running in the browser. Every query goes through
 * row-level security as the signed-in user, so the anon key is safe to ship.
 */
export function getSupabase(): SupabaseClient {
  if (browserClient) return browserClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const missing: string[] = []
  if (!url) missing.push(URL_KEY)
  if (!anon) missing.push(ANON_KEY)
  if (missing.length) throw new SupabaseConfigError(missing)

  browserClient = createBrowserClient(url!, anon!)
  return browserClient
}

/** True when the env vars are present, so callers can degrade instead of throw. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
