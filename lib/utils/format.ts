/**
 * Utility helpers for question option handling and display.
 */

import { QuestionOptions } from "../types/question"

const LETTERS = ["A", "B", "C", "D"] as const

/**
 * Convert an options object {A,B,C,D} to a display array ["A) ...", "B) ..."].
 */
export function optionsToArray(opts: QuestionOptions): string[] {
  return LETTERS.map((l) => `${l}) ${opts[l]}`)
}

/**
 * Convert an options array ["A) ...", "B) ..."] (or ["...", "..."]) back to
 * the structured {A,B,C,D} object.
 *
 * If the array elements contain a letter prefix (e.g. "A) ..."), it is stripped.
 * Otherwise the options are assigned positionally.
 */
export function arrayToOptions(arr: string[]): QuestionOptions {
  const result: QuestionOptions = { A: "", B: "", C: "", D: "" }

  arr.forEach((val, i) => {
    const letter = LETTERS[i]
    if (!letter) return
    // Strip "A) " prefix if present
    const cleaned = val.replace(/^[A-D]\)\s*/i, "").trim()
    result[letter] = cleaned
  })

  return result
}

/** Detect whether an options value is an object ({A,B,C,D}) or an array. */
export function isOptionsObject(v: unknown): v is QuestionOptions {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    "A" in v &&
    "B" in v &&
    "C" in v &&
    "D" in v
  )
}

/** Detect whether an options value is an array. */
export function isOptionsArray(v: unknown): v is string[] {
  return Array.isArray(v)
}

/** Safely extract an option value from a row object using various keys. */
export function extractOption(row: Record<string, unknown>, letter: "A" | "B" | "C" | "D"): string {
  const lower = letter.toLowerCase()
  const candidates = [letter, lower, `option${letter}`, `option_${lower}`, `choice${letter}`, `choice_${lower}`, `opt_${lower}`]

  for (const key of candidates) {
    const v = row[key]
    if (typeof v === "string" && v.trim().length > 0) return v.trim()
    if (typeof v === "number") return String(v)
  }

  return ""
}
