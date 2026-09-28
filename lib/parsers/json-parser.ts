/**
 * JSON Parser — parses JSON question files.
 *
 * Supports two JSON shapes:
 *   1. Array of objects with flat fields (optionA, optionB, …)
 *   2. Array of objects with nested options object { A, B, C, D }
 *
 * Also supports a top-level { questions: [...] } wrapper.
 */
import { RawRow } from "../types/question"

export interface JsonParseResult {
  rows: RawRow[]
  errors: string[]
}

/**
 * Parse a JSON file (or JSON string) into raw rows.
 */
export async function parseJson(
  file: File | string
): Promise<JsonParseResult> {
  const text: string =
    typeof file === "string" ? file : await file.text()

  const errors: string[] = []

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e: any) {
    return { rows: [], errors: [`JSON parse error: ${e.message}`] }
  }

  let arr: unknown[]

  // Handle wrapper object { questions: [...] }
  if (Array.isArray(data)) {
    arr = data
  } else if (typeof data === "object" && data !== null && "questions" in data) {
    const q = (data as any).questions
    arr = Array.isArray(q) ? q : [q]
  } else if (typeof data === "object" && data !== null) {
    arr = [data]
  } else {
    arr = []
  }

  if (!Array.isArray(arr)) {
    return { rows: [], errors: ["Expected a JSON array or { questions: [...] }"] }
  }

  const rows: RawRow[] = arr
    .filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null
    )
    .map((item) => {
      const row: RawRow = {}
      // Flatten nested options { A, B, C, D } into optionA, optionB, etc.
      if (item.options && typeof item.options === "object" && !Array.isArray(item.options)) {
        const opts = item.options as Record<string, unknown>
        if ("A" in opts) { row.optionA = opts.A }
        if ("B" in opts) { row.optionB = opts.B }
        if ("C" in opts) { row.optionC = opts.C }
        if ("D" in opts) { row.optionD = opts.D }
        const { options, ...rest } = item
        Object.assign(row, rest)
      } else {
        Object.assign(row, item)
      }
      return row
    })

  return { rows, errors }
}

export function isJsonFile(file: File): boolean {
  return (
    file.type.includes("json") || file.name.toLowerCase().endsWith(".json")
  )
}
