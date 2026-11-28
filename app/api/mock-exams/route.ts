import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { getAdminDb } from "@/lib/db-admin"
import { isProUser } from "@/lib/plan-access"
import {
  bankAvailability,
  canonicalExam,
  canonicalSubject,
  publicMockQuestion,
  selectMockQuestions,
  usableQuestion,
  type MockQuestion,
} from "@/lib/mock-exams"
import type { StoredQuestion } from "@/lib/questions"
export const dynamic = "force-dynamic"
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" },
  })
async function caller(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1]
  if (!token) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await client.auth.getUser(token)
  return !error && data.user ? { client, uid: data.user.id } : null
}
async function bank(client: NonNullable<Awaited<ReturnType<typeof caller>>>["client"], exam: string) {
  const rows: StoredQuestion[] = []
  for (let page = 0; page < 100; page++) {
    const { data, error } = await client
      .from("mock_question_bank")
      .select("id,data")
      .eq("exam_key", exam)
      .order("id")
      .range(page * 500, page * 500 + 499)
    if (error) throw new Error("Bank unavailable")
    for (const row of data) rows.push({ ...row.data, id: row.id })
    if (data.length < 500) return rows
  }
  throw new Error("Bank too large to verify completely")
}
async function draftAllowed(uid: string) {
  if (process.env.MOCK_DRAFT_REVIEW_ENABLED !== "true" || process.env.VERCEL_ENV === "production")
    return false
  const profile = await getAdminDb().collection("users").doc(uid).get()
  return profile.data()?.role === "admin"
}
export async function GET(request: Request) {
  try {
    const gate = await caller(request)
    if (!gate) return reply({ error: "Sign in to continue." }, 401)
    const exam = canonicalExam(new URL(request.url).searchParams.get("exam") || "WAEC")
    if (!["WAEC", "JAMB", "NECO"].includes(exam))
      return reply({ error: "Choose a supported exam board." }, 400)
    return reply({
      exam,
      subjects: bankAvailability(await bank(gate.client, exam)),
      draftReviewAvailable: await draftAllowed(gate.uid),
    })
  } catch {
    return reply(
      { error: "Question availability could not be checked. Please retry; no mock allowance has been used." },
      503,
    )
  }
}
export async function POST(request: Request) {
  try {
    const gate = await caller(request)
    if (!gate) return reply({ error: "Sign in to continue." }, 401)
    if (Number(request.headers.get("content-length")) > 16384)
      return reply({ error: "Request too large." }, 413)
    const reader = request.body?.getReader()
    if (!reader) return reply({ error: "Invalid request." }, 400)
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16384) {
        await reader.cancel()
        return reply({ error: "Request too large." }, 413)
      }
      chunks.push(value)
    }
    const raw = Buffer.concat(chunks).toString("utf8")
    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw)
    } catch {
      return reply({ error: "Invalid request." }, 400)
    }
    if (!body || typeof body !== "object") return reply({ error: "Invalid request." }, 400)
    if (body.action === "submit" || body.action === "checkpoint") {
      if (
        typeof body.attemptId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.attemptId) ||
        !body.answers ||
        typeof body.answers !== "object" ||
        Array.isArray(body.answers)
      )
        return reply({ error: "Invalid submission." }, 400)
      const { data, error } = await getSupabaseAdmin().rpc(
        body.action === "checkpoint" ? "checkpoint_mock_attempt" : "submit_mock_attempt",
        {
          p_uid: gate.uid,
          p_attempt: body.attemptId,
          p_answers: body.answers,
        },
      )
      if (error && error.code === "22023" && body.action === "checkpoint")
        return reply({ error: "The server answer-backup deadline has passed." }, 409)
      if (error)
        return reply(
          {
            error:
              error.code === "42501"
                ? "Attempt unavailable."
                : "Your result was not saved. Your answers are still on this screen; retry submission.",
          },
          error.code === "42501" ? 403 : 503,
        )
      return reply({ result: data })
    }
    if (
      body.action !== "start" ||
      typeof body.exam !== "string" ||
      !["full", "revision", "draft_review"].includes(String(body.mode))
    )
      return reply({ error: "Invalid exam request." }, 400)
    if (
      typeof body.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)
    )
      return reply({ error: "Missing start request identity." }, 400)
    const exam = canonicalExam(body.exam),
      mode = body.mode as "full" | "revision" | "draft_review"
    if (
      !["WAEC", "JAMB", "NECO"].includes(exam) ||
      !Array.isArray(body.subjects) ||
      body.subjects.some((s) => typeof s !== "string") ||
      body.subjects.length < 1 ||
      body.subjects.length > (mode === "full" ? 4 : 1)
    )
      return reply({ error: "Choose valid subjects." }, 400)
    const subjects = [...new Set((body.subjects as string[]).map(canonicalSubject))]
    let questions: MockQuestion[]
    if (mode === "draft_review") {
      if (!(await draftAllowed(gate.uid))) return reply({ error: "Draft review is unavailable." }, 403)
      if (exam !== "WAEC" || subjects[0] !== "Mathematics")
        return reply({ error: "Draft set is WAEC-style Mathematics only." }, 400)
      const draft = (await import("@/content/drafts/ss3-waec-mathematics-v1.json")).default
      // The draft is never imported into the public bank. Only this gated review can load it.
      questions = draft.questions
        .map((row) => usableQuestion({ ...row, source: draft.origin } as StoredQuestion, true))
        .filter((q): q is MockQuestion => !!q)
      if (questions.length !== 8) throw new Error("Draft validation failed")
    } else {
      try {
        questions = selectMockQuestions(await bank(gate.client, exam), subjects, mode)
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("No usable"))
          return reply({ error: error.message }, 409)
        throw error
      }
    }
    const profile = await getAdminDb().collection("users").doc(gate.uid).get()
    const { data, error } = await getSupabaseAdmin().rpc("start_mock_attempt", {
      p_uid: gate.uid,
      p_exam: exam,
      p_subjects: subjects,
      p_mode: mode,
      p_questions: questions,
      p_pro: isProUser(profile.data()),
      p_request_id: body.requestId,
    })
    if (error)
      return reply(
        {
          error:
            error.code === "P0001"
              ? "Your weekly full-mock allowance is used. Short revision does not use this allowance."
              : "The exam could not start. Retry; no partial attempt was saved.",
        },
        error.code === "P0001" ? 429 : 503,
      )
    return reply({
      ...data,
      mode,
      exam,
      subjects,
      questions: (data.questions as MockQuestion[]).map(publicMockQuestion),
      label:
        mode === "draft_review"
          ? "DRAFT: original WAEC-style practice — pending teacher approval; not official past questions."
          : null,
    })
  } catch {
    return reply({ error: "The exam service is unavailable. Please retry." }, 503)
  }
}
