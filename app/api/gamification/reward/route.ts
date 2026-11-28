import { NextResponse } from "next/server"
import { requireUser } from "@/lib/api-auth"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
export async function POST(request: Request) {
  const gate = await requireUser(request)
  if (!gate.ok) return gate.response
  try {
    if (Number(request.headers.get("content-length")) > 4096)
      return NextResponse.json({ error: "Request too large" }, { status: 413 })
    const reader = request.body?.getReader()
    if (!reader) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4096) {
        await reader.cancel()
        return NextResponse.json({ error: "Request too large" }, { status: 413 })
      }
      chunks.push(value)
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!["lesson", "practice", "purchase"].includes(body?.action))
      return NextResponse.json({ error: "Invalid reward operation" }, { status: 400 })
    const { data, error } = await getSupabaseAdmin().rpc("retail_reward", {
      p_uid: gate.uid,
      p_action: body.action,
      p_payload: body.payload,
    })
    if (error)
      return NextResponse.json(
        { error: "Reward operation was not permitted or could not be saved." },
        { status: 400 },
      )
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Reward service unavailable" }, { status: 503 })
  }
}

/** Badge counts come from private scoring records, never a legacy source label. */
export async function GET(request: Request) {
  const gate = await requireUser(request)
  if (!gate.ok) return gate.response
  const { data, error } = await getSupabaseAdmin().rpc("verified_quiz_counts", { p_uid: gate.uid })
  if (error) return NextResponse.json({ error: "Could not load verified quiz counts." }, { status: 503 })
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
}
