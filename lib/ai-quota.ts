import "server-only"

import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/db-admin"
import { isProUser } from "@/lib/plan-access"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

type Bucket = "practice" | "flashcards"

/** Checks and records the two daily free generations on the server. */
export async function freeGenerationGate(uid: string, bucket: Bucket, consume = false): Promise<NextResponse | null> {
  try {
    const profile = await getAdminDb().collection("users").doc(uid).get()
    if (isProUser(profile.data())) return null
    const { data, error } = consume
      ? await getSupabaseAdmin().rpc("take_daily_quota", { p_uid: uid, p_bucket: bucket, p_max: 2 })
      : await getSupabaseAdmin().rpc("daily_quota_used", { p_uid: uid, p_bucket: bucket })
    if (error) throw error
    if ((!consume && data === null) || (data !== null && !Number.isInteger(Number(data)))) {
      throw new Error("Invalid quota response")
    }
    if (consume ? data === null : Number(data) >= 2) {
      return NextResponse.json({ error: `You have used both free ${bucket} generations today. Try again tomorrow or upgrade to Pro.` }, { status: 429 })
    }
    return null
  } catch (error) {
    console.error("AI generation quota unavailable:", error)
    return NextResponse.json({ error: "Could not check your plan. Try again shortly." }, { status: 503 })
  }
}
