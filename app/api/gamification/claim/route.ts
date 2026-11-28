import { NextResponse } from "next/server"
import { requireUser } from "@/lib/api-auth"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
export async function POST(request: Request) {
  const gate = await requireUser(request)
  if (!gate.ok) return gate.response
  const body = await request.json().catch(() => null)
  if (
    !["xp", "lessons"].includes(body?.type) ||
    (body.tier !== undefined && (!Number.isInteger(body.tier) || body.tier < 1 || body.tier > 100000))
  )
    return NextResponse.json({ error: "Invalid quest claim" }, { status: 400 })
  const { data, error } = await getSupabaseAdmin().rpc("claim_quest_reward", {
    p_uid: gate.uid,
    p_type: body.type,
    p_tier: body.tier ?? null,
  })
  if (error)
    return NextResponse.json(
      { error: "Quest target not met or claim could not be saved." },
      { status: error.code === "22023" ? 400 : 409 },
    )
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}
