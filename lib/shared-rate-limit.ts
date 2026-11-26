import { createHash } from "node:crypto"
import { NextResponse } from "next/server"

type Rule = { max: number; windowMs: number }
type Counter = (args: { p_uid: string; p_bucket: string; p_max: number; p_window_seconds: number }) => PromiseLike<{ data: unknown; error: unknown }>

/** The counter is shared across instances; raw email addresses/IPs are not stored. */
export function createSharedLimiter(counter: Counter) {
  return async (bucket: string, subject: string, rule: Rule): Promise<NextResponse | null> => {
    try {
      const { data, error } = await counter({
        p_uid: createHash("sha256").update(subject).digest("hex"),
        p_bucket: bucket,
        p_max: rule.max,
        p_window_seconds: Math.ceil(rule.windowMs / 1000),
      })
      if (error || typeof data !== "number" || !Number.isInteger(data) || data < 0) throw new Error("Rate limit unavailable")
      if (data === 0) return null
      return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, {
        status: 429, headers: { "Retry-After": String(data), "Cache-Control": "no-store" },
      })
    } catch {
      // A database outage must not silently disable the abuse controls.
      return NextResponse.json({ error: "This service is temporarily unavailable. Please try again shortly." }, {
        status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      })
    }
  }
}

export const enforceSharedRateLimit = createSharedLimiter(async (args) => {
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin")
  return getSupabaseAdmin().rpc("take_api_rate_limit", args)
})
