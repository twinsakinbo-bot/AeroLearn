/**
 * Question Normalizer
 *
 * Converts raw rows from any parser (CSV, Excel, JSON) into the canonical
 * PracticeQuestion format. Handles:
 *   • Flexible column-name aliases
 *   • Options stored as object {A,B,C,D}, array ["A) ...", ...], or flat fields
 *   • Stripping "A)" prefixes from option values
 *   • Filling exam/year/subject defaults from the upload form
 *   • Coercing types (e.g. year to number)
 */
import { canonicalExam, canonicalSubject } from "./mock-exams"
import { COLUMN_ALIASES, Difficulty, PracticeQuestion, QuestionOptions, RawRow } from "./types/question"
import { arrayToOptions, extractOption, isOptionsArray, isOptionsObject } from "./utils/format"

/** Build a lookup: lowercase-aliased-column → canonical field */
function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    // Always include the canonical name itself
    map.set(canonical.toLowerCase(), canonical)
    aliases.forEach((a) => map.set(a.toLowerCase(), canonical))
  }
  return map
}

const ALIAS_MAP = buildAliasMap()

/**
 * Get a value from a raw row, checking the canonical key and all aliases.
 * Returns the first non-empty match.
 */
export function getRowValue(row: RawRow, canonical: string): unknown {
  if (row[canonical] !== undefined && row[canonical] !== null && String(row[canonical]).trim() !== "") {
    return row[canonical]
  }

  // Try aliases
  const aliases = COLUMN_ALIASES[canonical]
  if (aliases) {
    for (const alias of aliases) {
      if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== "") {
        return row[alias]
      }
      // Also try lowercase
      const lowerAlias = alias.toLowerCase()
      if (row[lowerAlias] !== undefined && row[lowerAlias] !== null && String(row[lowerAlias]).trim() !== "") {
        return row[lowerAlias]
      }
    }
  }

  return undefined
}

/**
 * Extract options from a raw row. Supports these layouts:
 *   1. opts.options is an object {A:"4", B:"5", ...}
 *   2. opts.options is an array ["4", "5", ...] or ["A) 4", ...]
 *   3. Flat fields: optionA, option_b, Option C, choiceD, etc.
 */
export function extractOptions(row: RawRow): Partial<QuestionOptions> {
  const result: Partial<QuestionOptions> = {}

  // --- Case 1: nested options object ---
  const optsField = getRowValue(row, "options")
  if (isOptionsObject(optsField)) {
    return { A: optsField.A, B: optsField.B, C: optsField.C, D: optsField.D }
  }

  // --- Case 2: options as array ---
  if (isOptionsArray(optsField)) {
    const arr = arrayToOptions(optsField)
    return arr
  }

  // --- Case 3: flat fields optionA/optionB/... ---
  const A = extractOption(row, "A")
  const B = extractOption(row, "B")
  const C = extractOption(row, "C")
  const D = extractOption(row, "D")

  if (A || B || C || D) {
    result.A = A || ""
    result.B = B || ""
    result.C = C || ""
    result.D = D || ""
  }

  return result
}

/**
 * Extract the correct answer letter from a raw row.
 * Handles values like "B", "B)", "Option B", "b", "2" (1-indexed).
 */
export function extractCorrectAnswer(row: RawRow): string | null {
  const raw = getRowValue(row, "correctAnswer")
  if (raw === undefined || raw === null) return null

  const str = String(raw).trim().toUpperCase()

  // Direct letter match
  if (["A", "B", "C", "D"].includes(str)) return str

  /**
   * "B)", "(B)", "Option B", "Ans: D" — the letter has to stand on its own.
   * This used to be `str.match(/([ABCD])/)`, the first A–D character anywhere in
   * the cell, so "Correct: D" imported as C (the C in CORRECT) and "None of the
   * above" imported as A (the A in ABOVE). Both then passed validation, because
   * A–D is the only thing it checks for, and a wrong answer went in marked right.
   */
  const token = str.split(/[^A-Z0-9]+/).find((part) => ["A", "B", "C", "D"].includes(part))
  if (token) return token

  // Numeric index (1=A, 2=B, 3=C, 4=D)
  const num = parseInt(str, 10)
  if (!isNaN(num) && num >= 1 && num <= 4) {
    return ["A", "B", "C", "D"][num - 1]
  }

  return null
}

/**
 * Extract the year as a positive integer.
 */
export function extractYear(row: RawRow): number | null {
  const raw = getRowValue(row, "year")
  if (raw === undefined) return null

  const num = parseInt(String(raw), 10)
  if (isNaN(num) || num <= 1900 || num > new Date().getFullYear() + 10) return null
  return num
}

/**
 * Normalize a raw row into a partial PracticeQuestion.
 * Defaults for exam/year/subject are applied from `defaults`.
 */
export function normalizeRow(
  row: RawRow,
  defaults: {
    exam?: string
    year?: number
    subject?: string
  },
  index: number
): PracticeQuestion {
  // Determine field values, preferring row over defaults
  const exam =
    (getRowValue(row, "exam") as string | undefined) || defaults.exam || ""
  /* `extractYear` range-checks the cell and returns null for anything unusable,
     so a file whose year column holds "N/A" falls back to the year picked on the
     form. This used to `parseInt` the cell itself and ignore the default the
     moment the column existed, which failed every row in the file. */
  const year = extractYear(row) ?? defaults.year ?? 0
  const subject =
    (getRowValue(row, "subject") as string | undefined) || defaults.subject || ""
  const topic = (getRowValue(row, "topic") as string | undefined) || undefined
  const questionNumberRaw = getRowValue(row, "questionNumber")
  const questionNumber = questionNumberRaw
    ? parseInt(String(questionNumberRaw), 10)
    : undefined
  const question = String(getRowValue(row, "question") || "").trim()
  const options = extractOptions(row) as QuestionOptions
  const correctAnswer = extractCorrectAnswer(row)
  const explanation = (getRowValue(row, "explanation") as string | undefined) || undefined
  const paper = (getRowValue(row, "paper") as string | undefined) || undefined
  const difficulty = (getRowValue(row, "difficulty") as string | undefined)?.trim() as Difficulty | undefined
  const source = (getRowValue(row, "source") as string | undefined) || undefined

  const now = new Date()

  return {
    _originalIndex: index,
    exam: canonicalExam(String(exam)),
    year: Number.isFinite(year) ? year : 0,
    subject: canonicalSubject(String(subject)),
    topic,
    questionNumber,
    question,
    options: { A: options.A || "", B: options.B || "", C: options.C || "", D: options.D || "" },
    /* Left empty when the file has no readable answer key. It used to fall back
       to "A", which the validator then accepted — option A has text, so nothing
       was flagged — and a wrong answer was imported as the correct one. Empty
       makes the validator raise "Invalid correct answer" and the row stops. */
    correctAnswer: (correctAnswer ?? "") as PracticeQuestion["correctAnswer"],
    explanation,
    paper,
    difficulty,
    source,
    publicationStatus: row.publicationStatus === "draft" ? "draft" : undefined,
    createdAt: now,
    updatedAt: now,
  }
}

