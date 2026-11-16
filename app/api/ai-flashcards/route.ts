/**
 * Turns a lesson's notes into a flashcard deck.
 *
 * This route was open: no token, and a Groq call on every request with up to
 * 15,000 characters of caller-supplied text. Anyone who found the URL could
 * spend the account's quota. A signed-in account is now required, and the
 * payload is capped before it reaches the model rather than silently truncated.
 *
 * Reading the reply was the same fragile code as `/api/ai-quiz` — and worse in
 * one respect: it deleted every character below U+0020 from the whole document,
 * which silently mangles content instead of escaping it. It shares
 * `lib/ai-json` now, which normalises escapes properly and can salvage a reply
 * the model ran out of budget mid-way through. `max_tokens` was also unset, so
 * a long lesson had no room to answer in.
 */
import { NextResponse } from "next/server"
import { aiKey, aiModel, aiVisionModel, chatCompletion, transcribeAudio } from "@/lib/ai-provider"

import { parseAiRows } from "@/lib/ai-json"
import { requireUser } from "@/lib/api-auth"
import { clientIp, rateLimit } from "@/lib/rate-limit"

const MAX_CONTENT_CHARS = 15_000
const MODEL = aiModel
const CARD_COUNT = 10
const MAX_TOKENS = 4_000

/** Where a wrapped array hides: JSON mode can only return an object. */
const ROW_KEYS = ["flashcards", "cards", "terms", "items", "data"]

const apiKey = aiKey

const SYSTEM =
  "You write revision flashcards for Nigerian secondary school students. You " +
  "reply with one JSON object and nothing else: no markdown fence, no commentary."

type Flashcard = { id: string; term: string; definition: string }

/** Where a model puts the two halves of a card when it does not follow the shape. */
const TERM_FIELDS = ["term", "front", "question", "title", "word", "name"]
const DEFINITION_FIELDS = ["definition", "back", "answer", "meaning", "description", "text"]

function field(row: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = row[name]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function toCard(row: Record<string, unknown>, index: number): Flashcard | null {
  const term = field(row, TERM_FIELDS)
  const definition = field(row, DEFINITION_FIELDS)
  if (!term || !definition) return null

  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : String(index + 1)
  return { id, term, definition }
}

function buildPrompt(content: string): string {
  return [
    `Pull the ${CARD_COUNT} most important terms out of the lesson below and define each one.`,
    "",
    "Rules:",
    "1. Definitions are one sentence, written to be memorised.",
    "2. Use the lesson's own wording where you can.",
    "3. Reply with this JSON object and nothing else:",
    "",
    JSON.stringify(
      {
        flashcards: [
          {
            id: "1",
            term: "Photosynthesis",
            definition: "How green plants use sunlight to make their own food.",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Lesson content:",
    content,
  ].join("\n")
}

async function ask(prompt: string, jsonMode: boolean): Promise<string> {
  const completion = await chatCompletion({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    model: MODEL,
    temperature: 0.4,
    max_tokens: MAX_TOKENS,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  })

  return completion.choices[0]?.message?.content || ""
}

export async function POST(req: Request) {
  const gate = await requireUser(req)
  if (!gate.ok) return gate.response

  const limit = rateLimit("ai-flashcards", clientIp(req), { max: 12, windowMs: 60_000 })
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Give it a minute before building another deck." },
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
    const content = typeof body?.content === "string" ? body.content : ""

    if (!content.trim()) {
      return NextResponse.json({ error: "No lesson content provided" }, { status: 400 })
    }
    if (content.length > MAX_CONTENT_CHARS) {
      return NextResponse.json({ error: "That lesson is too long to summarise." }, { status: 413 })
    }

    const prompt = buildPrompt(content)
    let flashcards: Flashcard[] = []

    for (const jsonMode of [true, false]) {
      let reply = ""
      try {
        reply = await ask(prompt, jsonMode)
      } catch (error) {
        console.error(`ai-flashcards: Groq call failed (jsonMode=${jsonMode}):`, error)
        continue
      }

      flashcards = parseAiRows(reply, ROW_KEYS)
        .map(toCard)
        .filter((card): card is Flashcard => card !== null)

      if (flashcards.length > 0) break
      console.error(
        `ai-flashcards: nothing usable in the reply (jsonMode=${jsonMode}):`,
        reply.slice(0, 500),
      )
    }

    if (flashcards.length === 0) {
      return NextResponse.json(
        { error: "No cards could be made from this lesson. Try again in a moment." },
        { status: 502 },
      )
    }

    return NextResponse.json({ flashcards })
  } catch (error) {
    console.error("AI Flashcards Error:", error)
    return NextResponse.json(
      { error: "Failed to generate flashcards. Please try again." },
      { status: 500 },
    )
  }
}
