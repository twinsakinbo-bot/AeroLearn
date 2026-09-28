/**
 * /api/admin/licences — mint, list and cancel prepaid code batches.
 *
 * Admin only, and it goes through the service-role Supabase client directly
 * rather than the Firestore-shaped shim in lib/db-admin, because `licence_codes`
 * is a real table with real columns and is deliberately absent from the
 * `doc_table_ok()` allowlist. Nothing should be querying money-shaped rows out
 * of a jsonb blob.
 *
 * THE ONE-PRINT RULE
 *
 * Only the SHA-256 of a code is ever stored, so the plaintext exists in exactly
 * one place: the response to the POST that minted it. That is a deliberate
 * trade — a stolen database dump then yields nothing usable — but it means a
 * batch that is not downloaded or copied out before the page is closed is
 * permanently gone. It cannot be recovered, only re-minted. The admin UI says so
 * plainly rather than leaving it as a footnote, and GET on a batch returns only
 * redemption state — never the codes — so it is obvious which is which.
 *
 * Every mint is recorded as a `licence_batches` row with quantity, channel and
 * who it went to, so there is an audit trail even without the codes themselves.
 */
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-auth"
import { planById, type PlanId } from "@/lib/plans"
import { codesToCsv, generateCodes, normalizeCode, codeId } from "@/lib/licences"

const MAX_BATCH = 500

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

const CHANNELS = new Set(["reseller", "school", "sponsor", "direct", "gift"])

export async function POST(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const entry = body as Record<string, unknown>
  const planId = clean(entry.planId, 40)
  const plan = planById(planId)

  if (!plan) {
    return NextResponse.json(
      { error: `"${planId || "nothing"}" is not a plan that can be sold.` },
      { status: 400 },
    )
  }

  const quantity = Number(entry.quantity)
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_BATCH) {
    return NextResponse.json(
      { error: `A batch is between 1 and ${MAX_BATCH} codes.` },
      { status: 400 },
    )
  }

  const channelRaw = clean(entry.channel, 20) || "direct"
  const channel = CHANNELS.has(channelRaw) ? channelRaw : "direct"
  const buyerNote = clean(entry.buyerNote, 300)
  const contact = clean(entry.contact, 200)
  const amountDueRaw = entry.amountDue
  const amountDue =
    typeof amountDueRaw === "number" && Number.isFinite(amountDueRaw)
      ? Math.max(0, Math.round(amountDueRaw * 100) / 100)
      : plan.amount * Math.floor(quantity)

  const codes = generateCodes(plan.id, quantity)
  if (codes.length === 0) {
    return NextResponse.json(
      { error: "The codes could not be generated. Try again." },
      { status: 500 },
    )
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase/admin")
  const supabase = getSupabaseAdmin()

  const batchId = crypto.randomUUID()

  const { error: batchError } = await supabase.from("licence_batches").insert({
    id: batchId,
    plan_id: plan.id,
    quantity: codes.length,
    channel,
    buyer_note: buyerNote || null,
    contact: contact || null,
    amount_due: amountDue,
    created_by: gate.uid,
  })

  if (batchError) {
    console.error("Could not record the licence batch:", batchError.message)
    return NextResponse.json(
      { error: "The batch could not be recorded, so no codes were issued." },
      { status: 500 },
    )
  }

  const { error: codesError } = await supabase.from("licence_codes").insert(
    codes.map((code) => ({
      id: codeId(code.code),
      plan_id: code.planId,
      status: "available",
      batch_id: batchId,
      channel,
      buyer_note: buyerNote || null,
    })),
  )

  if (codesError) {
    console.error("Could not store the licence codes:", codesError.message)
    // The batch row exists but the codes do not. Say so rather than reporting a
    // partial success — a seller told "minted" who then has no codes is the worst
    // possible outcome.
    await supabase.from("licence_batches").delete().eq("id", batchId)
    return NextResponse.json(
      { error: "The codes could not be stored, so the batch was discarded. Nothing was issued." },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    batchId,
    planId: plan.id,
    planName: plan.name,
    quantity: codes.length,
    amountDue,
    /** Plaintext exists only here. See the one-print rule above. */
    codes: codes.map((c) => c.code),
    csv: codesToCsv(
      codes.map((c) => ({ code: c.code, planId: c.planId, createdAt: new Date().toISOString() })),
    ),
  })
}

/** GET /api/admin/licences?batchId=… — one batch's codes and their status. */
export async function GET(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const url = new URL(request.url)
  const batchId = clean(url.searchParams.get("batchId"), 60)

  const { getSupabaseAdmin } = await import("@/lib/supabase/admin")
  const supabase = getSupabaseAdmin()

  if (batchId) {
    const { data, error } = await supabase
      .from("licence_codes")
      .select("id, plan_id, status, redeemed_email, redeemed_at, expires_granted, created_at")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true })
      .limit(MAX_BATCH)

    if (error) {
      console.error("Could not read the batch:", error.message)
      return NextResponse.json({ error: "That batch could not be read." }, { status: 500 })
    }

    // The plaintext is not recoverable, so a batch listing shows redemption state
    // only. The full codes were shown once, at mint time.
    return NextResponse.json({
      ok: true,
      codes: (data ?? []).map((row) => ({
        codeHint: String(row.id).slice(0, 8),
        planId: row.plan_id,
        status: row.status,
        redeemedEmail: row.redeemed_email ?? "",
        redeemedAt: row.redeemed_at ?? null,
        expiresGranted: row.expires_granted ?? null,
        createdAt: row.created_at,
      })),
    })
  }

  const { data, error } = await supabase
    .from("licence_batches")
    .select("id, plan_id, quantity, channel, buyer_note, contact, amount_due, settled, created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("Could not read the batches:", error.message)
    return NextResponse.json({ error: "Your batches could not be loaded." }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    batches: (data ?? []).map((row) => ({
      id: row.id,
      planId: row.plan_id,
      planName: planById(row.plan_id)?.name ?? row.plan_id,
      quantity: row.quantity,
      channel: row.channel ?? "direct",
      buyerNote: row.buyer_note ?? "",
      contact: row.contact ?? "",
      amountDue: Number(row.amount_due ?? 0),
      settled: Boolean(row.settled),
      createdAt: row.created_at,
    })),
  })
}

/**
 * PATCH { batchId, settled } or { code, status: "cancelled" }.
 *
 * Cancelling a code needs the plaintext, which only the holder of the batch has —
 * so this doubles as proof that a code is real: you cannot cancel one you cannot
 * name. Redemption state is then visible without exposing the code to anyone who
 * only has a database read.
 */
export async function PATCH(request: Request) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const entry = body as Record<string, unknown>
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin")
  const supabase = getSupabaseAdmin()

  const batchId = clean(entry.batchId, 60)
  if (batchId && typeof entry.settled === "boolean") {
    const { error } = await supabase
      .from("licence_batches")
      .update({
        settled: entry.settled,
        settled_at: entry.settled ? new Date().toISOString() : null,
      })
      .eq("id", batchId)

    if (error) {
      console.error("Could not update the batch:", error.message)
      return NextResponse.json({ error: "The batch could not be updated." }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const rawCode = clean(entry.code, 40)
  if (entry.status === "cancelled" && rawCode) {
    const key = normalizeCode(rawCode)
    if (key.length !== 14) {
      return NextResponse.json({ error: "That code is not the right length." }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("licence_codes")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", codeId(rawCode))
      .eq("status", "available")   // a redeemed code cannot be clawed back here
      .select("id")

    if (error) {
      console.error("Could not cancel the code:", error.message)
      return NextResponse.json({ error: "The code could not be cancelled." }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "No unused code matches that. It may already have been redeemed." },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Nothing to update." }, { status: 400 })
}
