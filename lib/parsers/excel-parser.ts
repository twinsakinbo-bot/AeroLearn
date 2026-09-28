/**
 * XLSX Parser — uses SheetJS xlsx to parse Excel files.
 *
 * Works in the browser.  Returns worksheet names so the UI can let the
 * admin pick which sheet to import.
 */
import * as XLSX from "xlsx"
import { RawRow } from "../types/question"

export interface XlsxParseResult {
  rows: RawRow[]
  sheetNames: string[]
  errors: string[]
}

export interface ParseXlsxOptions {
  /** Worksheet name to parse. If omitted, the first sheet is used. */
  sheetName?: string
}

/**
 * Parse an Excel file and return the rows from the selected (or first) sheet.
 */
export async function parseXlsx(
  file: File,
  opts: ParseXlsxOptions = {}
): Promise<XlsxParseResult> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: "array" })

  const errors: string[] = []
  const sheetNames = workbook.SheetNames

  let sheetName = opts.sheetName
  if (!sheetName && sheetNames.length > 0) {
    sheetName = sheetNames[0]
  }

  if (!sheetName) {
    return { rows: [], sheetNames: [], errors: ["No worksheets found"] }
  }

  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) {
    return { rows: [], sheetNames, errors: [`Sheet "${sheetName}" not found`] }
  }

  const json = XLSX.utils.sheet_to_json(worksheet, {
    defval: "",
    raw: false,      // keep all values as strings so we can normalize later
    blankrows: false,
  }) as Record<string, string>[]

  // Build raw rows, stripping empty cells
  const rows: RawRow[] = json.map((row) => {
    const cleaned: RawRow = {}
    Object.entries(row).forEach(([key, val]) => {
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        cleaned[key.trim()] = val
      }
    })
    return cleaned
  })

  return { rows, sheetNames, errors }
}

/**
 * Extract just worksheet names from an Excel file (for the sheet selector).
 */
export async function getXlsxSheetNames(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: "array" })
  return workbook.SheetNames
}

export function isXlsxFile(file: File): boolean {
  return (
    file.type.includes("excel") ||
    file.name.toLowerCase().match(/\.(xlsx|xls|xlsb)$/) !== null
  )
}
