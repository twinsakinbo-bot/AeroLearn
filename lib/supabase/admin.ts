/**
 * The service-role Supabase client — server only.
 *
 * This key bypasses row-level security completely, so it must never reach the
 * browser. Importing this module from a client component is a bug; the
 * `server-only` import below turns that bug into a build error rather than a
 * silently leaked key.
 *
 * Replaces the Firebase Admin SDK's service-account credential. Where that
 * needed three env vars and a private key with hand-repaired newlines, this
 * needs one.
 */
import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let serviceClient: SupabaseClient | null = null

export class SupabaseAdminConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `Supabase admin is not configured — missing ${missing.join(" and ")}. ` +
        `Set them in .env.local (never in NEXT_PUBLIC_*). See SUPABASE_SETUP.md.`,
    )
    this.name = "SupabaseAdminConfigError"
  }
}

/**
 * Full-access client for route handlers. Sessions are not persisted: each
 * request is stateless, and persisting would mean one request's auth state
 * could leak into the next on a warm serverless instance.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (serviceClient) return serviceClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  const missing: string[] = []
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL")
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY")
  if (missing.length) throw new SupabaseAdminConfigError(missing)

  serviceClient = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return serviceClient
}

/** True when the service role is available, so routes can 503 instead of 500. */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}
