/**
 * API Route: /api/aloc
 *
 * Server-side proxy for the ALOC past-question API (questions.aloc.com.ng).
 *
 * Three reasons this is not done from the browser, which is how it used to work:
 *
 * 1. **The access token was in `localStorage`.** A third-party API credential
 *    kept where any script on the page can read it, and sent from the browser
 *    where it shows up in every network log. It comes from `ALOC_ACCESS_TOKEN`
 *    on the server now; a token may still be passed per-request for an admin who
 *    has one but cannot set an environment variable, and it is never stored.
 * 2. **ALOC sends no CORS headers**, so the browser request was liable to be
 *    blocked outright before it ever reached them.
 * 3. **The response needed normalising against real field names.** ALOC v2
 *    returns `examtype` and `examyear`, all lowercase. The old client read
 *    `q.examType` and `q.examYear`, which are always `undefined`, so every
 *    imported question was stamped with the requested year — or the current one
 *    — rather than the year it actually came from.
 *
 * Nothing is written to Firestore here. The admin previews the result and then
 * posts it to /api/import-questions, which is where the batch write and the
 * duplicate check live.
 */
import { NextRequest, NextResponse } from "next/server"

import type { PracticeQuestion } from "@/lib/types/question"

/** ALOC slug → the subject name this app uses everywhere else. */
const SUBJECTS: Record<string, string> = {
  mathematics: "Mathematics",
  english: "English Language",
  biology: "Biology",
  chemistry: "Chemistry",
  physics: "Physics",
  economics: "Economics",
  commerce: "Commerce",
  accounting: "Accounting",
  government: "Government",
  history: "History",
  geography: "Geography",
  literature: "Literature-in-English",
  crk: "Christian Religious Studies",
  irk: "Islamic Religious Studies",
  civiceducation: "Civic Education",
}

const EXAM_TYPES: Record<string, string> = {
  utme: "JAMB",
  wassce: "WAEC",
  "post-utme": "Post-UTME",
}

const LETTERS = ["A", "B", "C", "D"] as const

type Skipped = { question: string; reason: string }

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** ALOC leaves unset fields as these, not as empty. */
function meaningful(value: unknown): string {
  const text = str(value)
  if (!text) return ""
  const lower = text.toLowerCase()
  return lower === "nil" || lower === "null" || lower === "n/a" || lower === "none" ? "" : text
}
/** ALOC v2 lowercases its field names, v1 did not. Read whichever is present. */
function pick(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = meaningful(source[key])
    if (value) return value
  }
  return ""
}

function imageUrl(source: Record<string, unknown>): string | null {
  const raw = pick(source, "image", "imageUrl", "image_url", "diagram", "figure")
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * ALOC gives the answer as the option letter, lowercase. Anything else — an
 * empty string, "nil", the answer text spelled out — means the key is unknown,
 * and the old client turned all of those into `"A"`: a wrong answer written into
 * the bank and marked correct. Such a row is skipped now instead.
 */
function answerOf(value: unknown): "A" | "B" | "C" | "D" | null {
  const letter = str(value).toUpperCase()
  return (LETTERS as readonly string[]).includes(letter)
    ? (letter as "A" | "B" | "C" | "D")
    : null
}

/** `examyear` arrives as a string. Anything that is not a plausible year is refused. */
function yearOf(value: unknown, fallback: number | null): number | null {
  const match = str(value).match(/\d{4}/)
  if (match) {
    const year = Number(match[0])
    if (year >= 1970 && year <= new Date().getFullYear() + 1) return year
  }
  return fallback
}

type Converted = { question: PracticeQuestion } | { skip: Skipped }

/**
 * One ALOC row into one PracticeQuestion, or the reason it cannot become one.
 * Nothing is guessed: a row missing an option, a year or a usable answer key is
 * reported back to the admin rather than filled in with a plausible-looking value.
 */
function convert(
  raw: unknown,
  requested: { exam: string; subject: string; year: number | null },
): Converted {
  if (!raw || typeof raw !== "object") {
    return { skip: { question: "—", reason: "ALOC sent something that was not a question." } }
  }
  const source = raw as Record<string, unknown>

  const sharedInstruction = pick(source, "instruction", "instructions", "passage", "comprehension", "direction", "directions")
  const text = meaningful(source.question)
  const diagram = imageUrl(source)
  const label = text ? text.slice(0, 90) : "—"
  if (!text) {
    return { skip: { question: label, reason: "The question text was empty." } }
  }

  const option = (source.option ?? {}) as Record<string, unknown>
  const options = { A: "", B: "", C: "", D: "" }
  const blank: string[] = []
  for (const letter of LETTERS) {
    const value = meaningful(option[letter.toLowerCase()])
    if (!value) blank.push(letter)
    options[letter] = value
  }
  if (blank.length > 0) {
    return {
      skip: {
        question: label,
        reason: `No text for option ${blank.join(", ")} — this one is a theory or fill-in question, not multiple choice.`,
      },
    }
  }

  const correctAnswer = answerOf(source.answer)
  if (!correctAnswer) {
    const given = str(source.answer)
    return {
      skip: {
        question: label,
        reason: given
          ? `ALOC gave the answer as "${given}", which is not A, B, C or D.`
          : "ALOC did not say which option is correct.",
      },
    }
  }

  /* The real reason this route exists. ALOC v2 returns `examyear`, all
     lowercase; the old client read `q.examYear`, got `undefined` every time,
     and stamped the requested year — or, with the year box left blank, the
     current one — on questions from any year ALOC felt like sending. */
  const year = yearOf(pick(source, "examyear", "examYear"), requested.year)
  if (!year) {
    return {
      skip: {
        question: label,
        reason: "ALOC did not say which year this came from, and no year was requested.",
      },
    }
  }

  /* ALOC echoes its own slug back, so it maps through the same table. A slug
     this app does not know falls back to what was asked for. */
  const exam = EXAM_TYPES[pick(source, "examtype", "examType").toLowerCase()] ?? requested.exam

  return {
    question: {
      exam,
      year,
      subject: requested.subject,
      topic: meaningful(source.section) || undefined,
      /* ALOC sometimes stores the common passage outside each item. Keep the
         context with every question so randomised practice stays answerable. */
      question: (sharedInstruction && !text.includes(sharedInstruction)
        ? `${sharedInstruction}\n\n${text}`
        : text) + (diagram && !text.includes(diagram)
          ? `\n\n<img src="${diagram.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" alt="Question diagram" />`
          : ""),
      options,
      correctAnswer,
      /* Left unset rather than "No explanation provided." — the question bank
         shows an explanation only when one exists, and that string is not one. */
      explanation: meaningful(source.solution) || undefined,
      source: "ALOC",
    },
  }
}

/** ALOC answers some failures with an HTML page, so its body is not relayed. */
function upstreamMessage(status: number): string {
  if (status === 401 || status === 403) return "ALOC rejected the access token."
  if (status === 404) return "ALOC has nothing for that subject, exam and year."
  if (status === 429) return "ALOC is rate-limiting this token. Wait a minute and try again."
  if (status >= 500) return `ALOC is having trouble of its own (${status}). Try again shortly.`
  return `ALOC refused the request (${status}).`
}

export async function POST(request: NextRequest) {
  const idToken = request.headers.get("authorization")?.replace("Bearer ", "").trim()
  if (!idToken) {
    return NextResponse.json({ error: "Sign in as an admin first." }, { status: 401 })
  }

  try {
    const { getAdminAuth, getAdminDb } = await import("@/lib/db-admin")
    const decoded = await getAdminAuth().verifyIdToken(idToken)
    const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get()
    if (!userSnap.exists || userSnap.data()?.role !== "admin") {
      return NextResponse.json({ error: "Admin access is required." }, { status: 403 })
    }
  } catch {
    return NextResponse.json(
      { error: "That sign-in could not be verified. Sign in again." },
      { status: 401 },
    )
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return NextResponse.json({ error: "The request body was not JSON." }, { status: 400 })
  }

  const slug = str(body.subject).toLowerCase()
  const subject = SUBJECTS[slug]
  if (!subject) {
    return NextResponse.json(
      { error: `"${slug || "(nothing)"}" is not a subject ALOC carries.` },
      { status: 400 },
    )
  }

  const typeSlug = str(body.examType).toLowerCase() || "utme"
  const exam = EXAM_TYPES[typeSlug]
  if (!exam) {
    return NextResponse.json({ error: `"${typeSlug}" is not an ALOC exam type.` }, { status: 400 })
  }

  const year = yearOf(body.year, null)
  if (str(body.year) && !year) {
    return NextResponse.json(
      { error: `"${str(body.year)}" is not a year ALOC would have.` },
      { status: 400 },
    )
  }

  /* ALOC's /m endpoint returns up to 40 in one call, so asking for more would
     silently give 40 anyway. */
  const asked = Number(body.limit)
  const max = Number.isFinite(asked) ? Math.min(40, Math.max(1, Math.floor(asked))) : 40

  /* Server-side variable first. A token may be posted by an admin who has one
     but cannot set an environment variable; it is used for this request and
     never written anywhere. */
  const token = process.env.ALOC_ACCESS_TOKEN?.trim() || str(body.accessToken)
  if (!token) {
    return NextResponse.json(
      {
        error:
          "No ALOC access token. Set ALOC_ACCESS_TOKEN on the server, or paste a token into the form for this one request.",
      },
      { status: 400 },
    )
  }

  const url = new URL("https://questions.aloc.com.ng/api/v2/m")
  url.searchParams.set("subject", slug)
  url.searchParams.set("type", typeSlug)
  if (year) url.searchParams.set("year", String(year))

  let payload: unknown
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", AccessToken: token },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
    const text = await response.text()
    if (!response.ok) {
      return NextResponse.json({ error: upstreamMessage(response.status) }, { status: 502 })
    }
    payload = text ? JSON.parse(text) : null
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError"
    return NextResponse.json(
      {
        error: timedOut
          ? "ALOC did not answer within 20 seconds."
          : "ALOC could not be reached, or its reply was not JSON.",
      },
      { status: 504 },
    )
  }

  const data = (payload as { data?: unknown } | null)?.data
  if (!Array.isArray(data) || data.length === 0) {
    return NextResponse.json(
      { error: "ALOC returned no questions for that subject, exam and year." },
      { status: 404 },
    )
  }

  const questions: PracticeQuestion[] = []
  const skipped: Skipped[] = []
  const seen = new Set<string>()

  for (const raw of data) {
    if (questions.length >= max) break

    const converted = convert(raw, { exam, subject, year })
    if ("skip" in converted) {
      skipped.push(converted.skip)
      continue
    }

    /* ALOC repeats itself within a single response often enough to matter. The
       import route's fingerprint catches duplicates against what is already
       stored; this catches them against each other, before the preview. */
    const key = converted.question.question.replace(/\s+/g, " ").trim().toLowerCase()
    if (seen.has(key)) {
      skipped.push({
        question: converted.question.question.slice(0, 90),
        reason: "ALOC sent this question twice in the same response.",
      })
      continue
    }
    seen.add(key)
    questions.push(converted.question)
  }

  /* Nothing is written here. The admin reviews `questions`, then posts them to
     /api/import-questions, which holds the batch write and the duplicate check. */
  return NextResponse.json({
    subject,
    exam,
    year: year ?? null,
    returned: data.length,
    questions,
    skipped,
  })
}
