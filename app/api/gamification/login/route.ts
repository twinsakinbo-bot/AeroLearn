import { NextResponse } from "next/server"
import { requireUser } from "@/lib/api-auth"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
export async function POST(request: Request) {
  const gate = await requireUser(request)
  if (!gate.ok) return gate.response
  const { data, error } = await getSupabaseAdmin().rpc("claim_login_reward", { p_uid: gate.uid })
  if (error)
    return NextResponse.json({ error: "Could not save your progress. Please try again." }, { status: 503 })
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}
