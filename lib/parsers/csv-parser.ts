/**
 * CSV Parser — uses PapaParse to parse CSV files in the browser.
 *
 * Returns raw rows as an array of objects whose keys are the column headers.
 */
import Papa from "papaparse"
import { ParsedFileResult, RawRow } from "../types/question"

export interface ParseCsvOptions {
  /** If true, the header row is read from the file. If false, headers from headerRow are used. */
  header?: boolean
  /** Custom header names (used when the CSV has no header row). */
  headerRow?: string[]
  /** Delimiter to use (auto-detected if not set). */
  delimiter?: string
}

export interface CsvParseResult {
  rows: RawRow[]
  headers: string[]
  errors: string[]
}

/**
 * Parse a CSV file (or CSV string) into raw rows.
 *
 * @param file  A File object from an input element, or a raw CSV string.
 * @param opts  Optional parsing options.
 */
export async function parseCsv(
  file: File | string,
  opts: ParseCsvOptions = {}
): Promise<CsvParseResult> {
  const text: string =
    typeof file === "string" ? file : await file.text()

  return new Promise((resolve) => {
    const headers: string[] = []
    const rows: RawRow[] = []
    const errors: string[] = []

    Papa.parse(text, {
      header: opts.header ?? true,
      skipEmptyLines: "greedy",
      dynamicTyping: true,
      delimiter: opts.delimiter,
      // Use the first row as header if header=true;
      // otherwise use custom headerRow
      transformHeader: (h) => {
        const trimmed = h.trim()
        if (opts.headerRow && !headers.length) {
          // custom header mode — not used when header=true
        }
        if (!headers.includes(trimmed)) {
          headers.push(trimmed)
        }
        return trimmed
      },
      complete: (results: any) => {
        if (results.errors && results.errors.length > 0) {
          results.errors.forEach((e: any) => {
            if (e.type === "FieldMismatch" || e.type === "DelimiterMismatch") {
              // Non-fatal — continue
            } else {
              errors.push(`${e.message} (type: ${e.type})`)
            }
          })
        }

        const dataRows = results.data as Record<string, unknown>[]

        // If custom headers provided, apply them
        if (opts.headerRow && !opts.header) {
          opts.headerRow.forEach((col, i) => {
            headers[i] = col
          })
          dataRows.forEach((row) => {
            const newRow: RawRow = {}
            opts.headerRow!.forEach((col, i) => {
              newRow[col] = row[`__col${i}`] !== undefined
                ? row[`__col${i}`]
                : row[i]
            })
            rows.push(newRow)
          })
        } else {
          dataRows.forEach((row) => {
            if (row) {
              rows.push(row)
            }
          })
        }

        resolve({ rows, headers, errors })
      },
    })
  })
}

/**
 * Detect whether a file is CSV based on its MIME type or extension.
 */
export function isCsvFile(file: File): boolean {
  return file.type.includes("csv") || file.name.toLowerCase().endsWith(".csv")
}
