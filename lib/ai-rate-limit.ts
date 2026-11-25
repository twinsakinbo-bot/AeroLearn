import "server-only"

import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/** A shared per-account budget for paid model calls across server instances. */
export async function enforceAiRateLimit(uid: string): Promise<NextResponse | null> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc("take_api_rate_limit", {
      p_uid: uid,
      p_bucket: "ai-inference",
      p_max: 20,
      p_window_seconds: 60,
    })
    if (error) throw error
    const retryAfter = Number(data)
    if (!Number.isFinite(retryAfter)) throw new Error("Invalid rate limit response")
    return retryAfter > 0
      ? NextResponse.json({ error: "Too many AI requests. Try again shortly." }, {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        })
      : null
  } catch (error) {
    console.error("AI rate limit unavailable:", error)
    return NextResponse.json({ error: "AI is temporarily unavailable. Try again shortly." }, { status: 503 })
  }
}
