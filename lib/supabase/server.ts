/**
 * The Supabase client for server-side code that acts *as the signed-in user*.
 *
 * Distinct from the other two: lib/supabase/client.ts runs in the browser, and
 * lib/supabase/admin.ts holds the service role and bypasses RLS. This one reads
 * the session out of the request cookies and is therefore subject to the same
 * policies as the browser — which is what route handlers that act on a student's
 * behalf want.
 *
 * It can also *write* cookies, which is why the OAuth callback lives on the
 * server: completing the code exchange sets the session cookie in the response.
 */
import "server-only"

import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

export async function getSupabaseServer(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. See SUPABASE_SETUP.md.",
    )
  }

  const store = await cookies()

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return store.getAll()
      },
      setAll(list) {
        // Route handlers and server actions may set cookies; a Server Component
        // render may not, and throws. Nothing here depends on the write
        // succeeding in that case — the browser client refreshes its own session.
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          /* read-only context */
        }
      },
    },
  })
}
