/**
 * Generates a practice quiz with Groq.
 *
 * It was an open proxy onto a paid key: no token check, and `numQuestions` was
 * interpolated straight into the prompt, so a single unauthenticated caller in a
 * loop could ask for a thousand questions at a time and spend the account's
 * inference budget. It now needs a signed-in account, the count is clamped, every
 * field that reaches the prompt is length-capped, and there is a per-IP limit on
 * top of that.
 *
 * The caller also sent the *difficulty* as `classLevel` — the practice page
 * passed `classLevel: difficulty`, so the prompt read "Class Level: Easy" and
 * anchored the syllabus to a level that does not exist. They are separate inputs
 * now: `classLevel` picks the syllabus, `difficulty` sets how hard the questions
 * are within it. A `classLevel` that is not one of the app's real class levels is
 * dropped rather than passed through, so an older caller still gets a quiz — it
 * just has no syllabus anchor.
 *
 * **The 502 students were seeing.** The reply was read with `indexOf("[")` and a
 * bare `JSON.parse`, which fails on a truncated reply, on a `[` that appears in
 * the model's prose, on the backslash in `\frac{1}{2}`, and on a trailing comma.
 * `openai/gpt-oss-20b` is a reasoning model, so its reasoning eats the same
 * `max_tokens` budget as the answer and truncation was the common case. Four
 * changes: `reasoning_effort: "low"` and a bigger budget so it fits, JSON mode so
 * the reply is an object rather than prose, `lib/ai-json` to read it, and one
 * retry without JSON mode if the first attempt comes back unusable.
 *
 * **`[object Object]` in the options.** The prompt asked for `options` as
 * `[{ id, text }]` — an array of objects — which every consumer then had to guess
 * at. It asks for the A–D map the question bank actually stores, and the reply is
 * normalised through `lib/questions` before it leaves here, so `options` is
 * always `{A,B,C,D}` and `correctAnswer` is always a letter no matter what the
 * model returned.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { aiKey, aiModel, aiVisionModel, chatCompletion, transcribeAudio } from "@/lib/ai-provider"

import { parseAiRows } from "@/lib/ai-json"
import { requireUser } from "@/lib/api-auth"
import { enforceAiRateLimit } from "@/lib/ai-rate-limit"
import { freeGenerationGate } from "@/lib/ai-quota"
import { CLASS_LEVELS } from "@/lib/constants"
import { correctLetterOf, optionsOf, questionText, type StoredQuestion } from "@/lib/questions"
import { clientIp, rateLimit } from "@/lib/rate-limit"

const apiKey = aiKey

const MODEL = aiModel
const MIN_QUESTIONS = 1
const MAX_QUESTIONS = 20

/** Where a wrapped array hides: JSON mode can only return an object. */
const ROW_KEYS = ["questions", "quiz", "items", "data", "results"]

/** Trimmed so a long body cannot be used to run up a bill. */
const cap = (value: unknown, limit: number) =>
  String(value ?? "")
    .trim()
    .slice(0, limit)

const SYSTEM =
  "You are an examiner writing multiple-choice questions for Nigerian secondary " +
  "school students. You reply with one JSON object and nothing else: no markdown " +
  "fence, no explanation before or after it."

type QuizQuestion = {
  id: string
  question: string
  options: Record<string, string>
  correctAnswer: string
  explanation: string
  subject: string
}

/**
 * One row of the model's reply, in the shape the rest of the app stores.
 *
 * The readers in `lib/questions` do the work, because they already handle every
 * shape a question has ever arrived in — an A–D map, an array of strings, an
 * array of `{id, text}` objects, an answer given as a letter, as an index, or as
 * the option's full text. Anything they cannot make sense of returns `null` and
 * is dropped: a question with one option or no marked answer is unanswerable, and
 * shipping it to the student is worse than shipping nineteen questions.
 */
function toQuestion(row: Record<string, unknown>, index: number, subject: string): QuizQuestion | null {
  const stored = row as StoredQuestion
  const question = questionText(stored)
  const options = optionsOf(stored)
  const correctAnswer = correctLetterOf(stored)

  if (question === "Question" || options.length < 2 || !correctAnswer) return null

  const map: Record<string, string> = {}
  for (const option of options) map[option.letter] = option.text

  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `q${index + 1}`
  const explanation = typeof row.explanation === "string" ? row.explanation.trim() : ""

  return { id, question, options: map, correctAnswer, explanation, subject }
}

function buildPrompt(input: {
  count: number
  subject: string
  exam: string
  classLevel: string
  difficulty: string
}): string {
  const { count, subject, exam, classLevel, difficulty } = input

  return [
    `Write ${count} multiple-choice question${count === 1 ? "" : "s"}.`,
    `Subject: ${subject}`,
    `Target exam: ${exam}`,
    classLevel ? `Class level: ${classLevel}` : "",
    difficulty ? `Difficulty: ${difficulty}` : "",
    "",
    "Rules:",
    `1. Match the ${classLevel || "senior secondary"} syllabus for ${exam}.`,
    '2. Exactly four options, keyed "A" to "D". Exactly one is correct.',
    '3. "correctAnswer" is the letter of the correct option.',
    "4. Keep each explanation to one or two sentences.",
    "5. Reply with this JSON object and nothing else:",
    "",
    JSON.stringify(
      {
        questions: [
          {
            id: "q1",
            question: "The question text",
            options: { A: "First option", B: "Second", C: "Third", D: "Fourth" },
            correctAnswer: "A",
            explanation: "Why A is correct.",
          },
        ],
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * One call. `reasoning_effort: "low"` matters more than it looks: the model's
 * reasoning is charged against `max_tokens`, and at the default effort a
 * twenty-question request spent most of the budget thinking and got cut off
 * mid-answer.
 */
async function ask(prompt: string, maxTokens: number, jsonMode: boolean): Promise<string> {
  const completion = await chatCompletion({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    model: MODEL,
    temperature: 0.5,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  })

  return completion.choices[0]?.message?.content || ""
}

export async function POST(req: Request) {
  const gate = await requireUser(req)
  if (!gate.ok) return gate.response
  const limited = await enforceAiRateLimit(gate.uid)
  if (limited) return limited

  /* The key is paid for by the account, not by the caller. */
  const limit = rateLimit("ai-quiz", clientIp(req), { max: 15, windowMs: 60_000 })
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That is a lot of quizzes at once. Give it a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    )
  }

  try {
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI is currently unavailable (API key not configured)" },
        { status: 503 },
      )
    }

    const body = await req.json().catch(() => null)
    const subject = cap(body?.subject, 60)
    const difficulty = cap(body?.difficulty, 40)
    const exam = cap(body?.exam, 20) || "WAEC"

    if (!subject) {
      return NextResponse.json({ error: "Pick a subject first." }, { status: 400 })
    }
    const quota = await freeGenerationGate(gate.uid, "practice")
    if (quota) return quota

    /* Anything that is not a real class level is dropped — see the note above. */
    const requested = cap(body?.classLevel, 20)
    const classLevel = (CLASS_LEVELS as readonly string[]).includes(requested) ? requested : ""

    const asked = Number(body?.numQuestions)
    const count = Number.isFinite(asked)
      ? Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, Math.round(asked)))
      : 5

    const prompt = buildPrompt({ count, subject, exam, classLevel, difficulty })
    /* Room for the answer *and* the reasoning that precedes it. */
    const budget = Math.min(16_000, 1_500 + count * 400)

    let questions: QuizQuestion[] = []

    /* Two attempts. JSON mode first; then without it, which covers both a model
       that will not honour the flag and a first reply that came back unusable. */
    for (const jsonMode of [true, false]) {
      let reply = ""
      try {
        reply = await ask(prompt, budget, jsonMode)
      } catch (error) {
        console.error(`ai-quiz: Groq call failed (jsonMode=${jsonMode}):`, error)
        continue
      }

      questions = parseAiRows(reply, ROW_KEYS)
        .map((row, index) => toQuestion(row, index, subject))
        .filter((question): question is QuizQuestion => question !== null)

      if (questions.length > 0) break
      console.error(`ai-quiz: nothing usable in the reply (jsonMode=${jsonMode}):`, reply.slice(0, 500))
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "The quiz could not be written this time. Try again in a moment." },
        { status: 502 },
      )
    }

    const consumed = await freeGenerationGate(gate.uid, "practice", true)
    if (consumed) return consumed
    const sessionId = crypto.randomUUID()
    // Server-owned formative snapshot. It is never trusted assessment content.
    questions = questions.map((q, index) => ({ ...q, id: `q${index + 1}` }))
    const registered = await getSupabaseAdmin().rpc("register_practice_session", {
      p_uid: gate.uid,
      p_id: sessionId,
      p_questions: questions,
    })
    if (registered.error) throw registered.error
    return NextResponse.json({ questions, sessionId })
  } catch (error) {
    console.error("AI Quiz Error:", error)
    return NextResponse.json({ error: "Failed to generate questions. Please try again." }, { status: 500 })
  }
}
