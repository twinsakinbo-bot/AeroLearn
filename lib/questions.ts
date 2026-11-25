import { comparableText } from "@/lib/rich-text"
import type { PracticeQuestion } from "@/lib/types/question"

/**
 * Reading the question bank.
 *
 * `practiceQuestions` documents are meant to hold `options` as an A–D map and
 * `correctAnswer` as a letter, but nothing in the pipeline guarantees it. Older
 * imports stored options as a plain array, a few rows stored the answer as the
 * option's full text, and `/api/ai-quiz` hands back
 * `[{ id: "A", text: "…" }, …]` — an array of *objects*.
 *
 * That last shape is where `[object Object]` on screen came from: this file did
 * `String(entry)` on each array element, which is exactly what `String()` does
 * to an object. Options are now read through `optionValueText()`, which looks
 * inside the object for the text, and a letter the row supplies is honoured
 * rather than assumed from position — `[{id:"C"},{id:"A"}]` used to mark the
 * wrong answer as correct.
 */

export const OPTION_LETTERS = ["A", "B", "C", "D"] as const

export type OptionLetter = (typeof OPTION_LETTERS)[number]

/** The canonical shape, loosened to what the database may actually hand back. */
export type StoredQuestion = Partial<Omit<PracticeQuestion, "options">> & {
  id?: string
  /** Some rows use `text` rather than `question`. */
  text?: string
  /** A map, an array of strings, or an array of `{ id, text }` objects. */
  options?: unknown
}

export type QuestionOption = { letter: OptionLetter; text: string }

/**
 * Where the text of one option hides, in priority order. `label` comes last
 * because in `{ label: "A", value: "8.4 cm" }` it holds the letter, not the text.
 */
const TEXT_FIELDS = ["text", "value", "content", "option", "answer", "title", "name", "label"]

/** Where a letter the row assigned itself hides. */
const LETTER_FIELDS = ["letter", "id", "key", "label", "option"]

const LETTER_PATTERN = /^\(?\s*([A-Da-d])\s*[).:,-]?\s*$/

export function questionText(question: StoredQuestion): string {
  return question.question || question.text || "Question"
}

/** `"a"`, `"(C)"`, `"D."` → the letter. Anything else → null. */
function asLetter(value: unknown): OptionLetter | null {
  if (typeof value !== "string") return null
  const match = LETTER_PATTERN.exec(value.trim())
  return match ? (match[1].toUpperCase() as OptionLetter) : null
}

/**
 * The text of one option, whatever it is wrapped in. Returns "" rather than
 * `"[object Object]"` for a shape it cannot read, so the option is dropped
 * instead of displayed as noise.
 */
function optionValueText(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (!value || typeof value !== "object" || Array.isArray(value)) return ""

  const record = value as Record<string, unknown>
  for (const field of TEXT_FIELDS) {
    const candidate = record[field]
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
    if (typeof candidate === "number") return String(candidate)
  }

  /* `{ "C": "8.4 cm" }` — the only key is the letter, and the value is the text. */
  const strings = Object.values(record).filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  )
  return strings.length === 1 ? strings[0].trim() : ""
}

/** A letter the row assigned to this option, if it did. */
function optionLetterOf(value: unknown): OptionLetter | null {
  const direct = asLetter(value)
  if (direct) return direct
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  for (const field of LETTER_FIELDS) {
    const letter = asLetter(record[field])
    if (letter) return letter
  }
  return null
}

/** Case-insensitive key lookup, so `{ a: … }` reads the same as `{ A: … }`. */
function keyed(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) out[key.trim().toLowerCase()] = value
  return out
}

/**
 * Imported rows often carry the letter inside the text — `"A. 62"` — and the UI
 * already draws a letter chip beside it, so it reads as "A A. 62". Stripping is
 * only safe when *every* option is labelled with its own letter: option A of
 * "A.D. 1960" must not become "D. 1960" on its own.
 */
function stripLabels(options: QuestionOption[]): QuestionOption[] {
  const pattern = (letter: string) => new RegExp(`^(?:\\(\\s*${letter}\\s*\\)|${letter}\\s*[).:,-])\\s*`, "i")

  const stripped = options.map((option) => ({
    letter: option.letter,
    text: option.text.replace(pattern(option.letter), "").trim(),
  }))

  const everyOneLabelled = stripped.every(
    (option, index) => option.text.length > 0 && option.text !== options[index].text,
  )
  return everyOneLabelled ? stripped : options
}

/** Options as letter/text pairs, empty entries dropped, capped at four. */
export function optionsOf(question: StoredQuestion): QuestionOption[] {
  const source = question as unknown as Record<string, unknown>
  const raw = question.options ?? source.choices ?? source.answers
  const entries: Array<{ letter: OptionLetter | null; text: string }> = []

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      /* Only an object may name its own letter: a bare "A" in the array is far
         more likely to be the option's text than a label for it. */
      const letter = entry && typeof entry === "object" ? optionLetterOf(entry) : null
      entries.push({ letter, text: optionValueText(entry) })
    }
  } else if (raw && typeof raw === "object") {
    const map = keyed(raw as Record<string, unknown>)
    for (const letter of OPTION_LETTERS) {
      entries.push({ letter, text: optionValueText(map[letter.toLowerCase()]) })
    }
  } else {
    /* `optionA` … `optionD`, the shape the file importer writes before it
       normalises, and the shape a few older rows were saved in. */
    for (const letter of OPTION_LETTERS) {
      entries.push({ letter, text: optionValueText(source[`option${letter}`]) })
    }
  }

  const slots = new Map<OptionLetter, string>()
  const unplaced: string[] = []

  for (const entry of entries) {
    if (!entry.text) continue
    if (entry.letter && !slots.has(entry.letter)) slots.set(entry.letter, entry.text)
    else unplaced.push(entry.text)
  }

  for (const text of unplaced) {
    const free = OPTION_LETTERS.find((letter) => !slots.has(letter))
    if (!free) break
    slots.set(free, text)
  }

  return stripLabels(
    OPTION_LETTERS.filter((letter) => slots.has(letter)).map((letter) => ({
      letter,
      text: slots.get(letter) as string,
    })),
  )
}

/** Every field that has been used to store the answer, in priority order. */
const ANSWER_FIELDS = [
  "correctAnswer",
  "correct_answer",
  "correctOption",
  "answerKey",
  "correct",
  "answer",
]

/**
 * The correct option's letter.
 *
 * Handles a letter, an object carrying one, an index into the options, and the
 * answer stored as the option's own text — that last one compared through
 * `comparableText`, so `"62<sub>7</sub>"` matches an option of `"62 <sub>7</sub>"`.
 */
export function correctLetterOf(question: StoredQuestion): OptionLetter | null {
  const source = question as unknown as Record<string, unknown>
  const options = optionsOf(question)
  if (options.length === 0) return null

  const has = (letter: OptionLetter) => options.some((option) => option.letter === letter)

  for (const field of ANSWER_FIELDS) {
    const raw = source[field]
    if (raw === null || raw === undefined || raw === "") continue

    const letter = optionLetterOf(raw)
    if (letter && has(letter)) return letter

    /* An index. Ours are zero-based; a row written by hand may be one-based. */
    if (typeof raw === "number" && Number.isInteger(raw)) {
      if (raw >= 0 && raw < options.length) return options[raw].letter
      if (raw >= 1 && raw <= options.length) return options[raw - 1].letter
      continue
    }

    const wanted = comparableText(raw)
    if (!wanted) continue
    const match = options.find((option) => comparableText(option.text) === wanted)
    if (match) return match.letter
  }

  return null
}

/** Missing or invalid answer keys never award credit, including for a blank answer. */
export function isCorrectAnswer(question: StoredQuestion, selected: OptionLetter | null | undefined): boolean {
  const correct = correctLetterOf(question)
  return correct !== null && selected === correct
}

/** Scores the exact question set shown in a timed mock exam. */
export function scoreAnswers(questions: StoredQuestion[], answers: Record<string, OptionLetter | null>): number {
  return questions.reduce((score, question) =>
    score + (question.id && isCorrectAnswer(question, answers[question.id]) ? 1 : 0), 0)
}

/** Fisher–Yates, on a copy. `sort(() => Math.random() - 0.5)` is not a shuffle. */
export function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}



