import { NextResponse } from "next/server"

import { aiKey, chatCompletion } from "@/lib/ai-provider"
import { requireSchedulerOrAdmin } from "@/lib/api-auth"
import { parseAiJson } from "@/lib/ai-json"

type Issue = { index: number; reason: string }

export async function POST(request: Request) {
  const gate = await requireSchedulerOrAdmin(request)
  if (!gate.ok) return gate.response
  if (!aiKey) return NextResponse.json({ error: "Set COARENA_API_KEY to review ALOC questions." }, { status: 503 })

  const body = await request.json().catch(() => null)
  const questions = body?.questions
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > 40) {
    return NextResponse.json({ error: "Send 1 to 40 questions for review." }, { status: 400 })
  }
  const compact = questions.map((q: any, index: number) => ({
    index,
    question: String(q?.question ?? "").slice(0, 900),
    hasImage: /<img\b/i.test(String(q?.question ?? "")),
    options: q?.options,
    answer: q?.correctAnswer,
    explanation: String(q?.explanation ?? "").slice(0, 300),
  }))

  try {
    const messages = [
        { role: "system", content: "Review exam questions for missing referenced diagrams, figures, tables, passages, shared instructions, or earlier questions. Do not guess an answer or invent a missing figure. Return one JSON object with an issues array. Each issue has index (zero based) and reason (short). Only flag concrete evidence that a question cannot stand alone. Return {\"issues\":[]} if all stand alone." },
        { role: "user", content: JSON.stringify(compact) },
    ] as const
    let parsed: { issues?: unknown } | null = null
    for (const jsonMode of [true, false]) {
      try {
        const result = await chatCompletion({
          messages: [...messages],
          max_tokens: 1800,
          ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        })
        parsed = parseAiJson(result.choices[0]?.message?.content || "") as { issues?: unknown } | null
        if (parsed && Array.isArray(parsed.issues)) break
      } catch (error) {
        if (!jsonMode) throw error
      }
    }
    if (!parsed || !Array.isArray(parsed.issues)) throw new Error("Review returned no issue list")
    const issues: Issue[] = parsed.issues
      .filter((item: any) => Number.isInteger(item?.index) && item.index >= 0 && item.index < questions.length && typeof item.reason === "string")
      .map((item: any) => ({ index: item.index, reason: item.reason.slice(0, 240) }))
    for (const item of compact) {
      const text = item.question.replace(/<[^>]*>/g, " ")
      const referencesFigure = /\b(?:diagram|figure|graph|chart|map|table)\s+(?:above|below|shown|provided|illustrated|labelled|labeled|represents|shows)\b|\b(?:above|below|following)\s+(?:diagram|figure|graph|chart|map|table)\b/i.test(text)
      if (referencesFigure && !item.hasImage && !issues.some((issue) => issue.index === item.index)) {
        issues.push({ index: item.index, reason: "This question refers to a visual, but ALOC supplied no image. Add the diagram or remove the question." })
      }
    }
    return NextResponse.json({ issues })
  } catch (error) {
    console.error("ALOC review failed:", error)
    return NextResponse.json({ error: "AI review failed. Try again before importing." }, { status: 502 })
  }
}
