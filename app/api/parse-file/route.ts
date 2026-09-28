/**
 * API Route: /api/parse-file
 *
 * Server-side file parsing endpoint.
 * Handles CSV, Excel, JSON (structured) and PDF, DOCX (text extraction).
 *
 * For PDF and DOCX, only raw text is returned — the admin reviews
 * the text before questions are parsed from it.
 *
 * For CSV, Excel, and JSON, fully parsed rows are returned.
 *
 * This route was open to the internet. Its only caller is the admin question
 * importer, but anyone could POST to it, and PDF/XLSX parsing holds the whole
 * file in memory and is CPU-bound — a handful of large uploads is enough to
 * exhaust a serverless instance. It now requires the same admin ID token as
 * `/api/import-questions`, and refuses anything over 15MB before reading it.
 */
import { NextRequest, NextResponse } from "next/server"
import { parseCsv } from "@/lib/parsers/csv-parser"
import { parseXlsx, getXlsxSheetNames } from "@/lib/parsers/excel-parser"
import { parseJson } from "@/lib/parsers/json-parser"
import { parseDocx } from "@/lib/parsers/docx-parser"
import { parsePdf } from "@/lib/parsers/pdf-parser"

const MAX_BYTES = 15 * 1024 * 1024

/** Returns a response to send back, or null when the caller is an admin. */
async function refuse(request: NextRequest): Promise<NextResponse | null> {
  const idToken = request.headers.get("authorization")?.replace("Bearer ", "").trim()
  if (!idToken) {
    return NextResponse.json({ error: "Sign in as an admin to parse files." }, { status: 401 })
  }

  try {
    const { getAdminAuth, getAdminDb } = await import("@/lib/db-admin")
    const decoded = await getAdminAuth().verifyIdToken(idToken)
    const snap = await getAdminDb().collection("users").doc(decoded.uid).get()
    if ((snap.exists ? snap.data()?.role : undefined) !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 })
    }
    return null
  } catch {
    return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  const denied = await refuse(request)
  if (denied) return denied

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const sheetName = formData.get("sheetName") as string | null
    const fileType = formData.get("fileType") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Split it into files under ${MAX_BYTES / 1024 / 1024}MB.`,
        },
        { status: 413 }
      )
    }

    const name = file.name.toLowerCase()
    const detectedType = fileType || detectFileType(name)

    // --- CSV ---
    if (detectedType === "csv" || name.endsWith(".csv")) {
      const result = await parseCsv(file)
      return NextResponse.json({
        fileType: "csv",
        rows: result.rows,
        headers: result.headers,
        errors: result.errors,
      })
    }

    // --- Excel ---
    if (detectedType === "xlsx" || name.match(/\.(xlsx|xls|xlsb)$/)) {
      let sheets: string[] = []
      try {
        sheets = await getXlsxSheetNames(file)
      } catch (e: any) {
        return NextResponse.json(
          { error: `Failed to read Excel file: ${e.message}` },
          { status: 400 }
        )
      }

      // If a specific sheet was requested, parse it; otherwise just return sheet names
      if (sheetName) {
        const result = await parseXlsx(file, { sheetName })
        return NextResponse.json({
          fileType: "xlsx",
          rows: result.rows,
          worksheetNames: sheets,
          errors: result.errors,
        })
      }

      return NextResponse.json({
        fileType: "xlsx",
        worksheetNames: sheets,
        rows: [],
      })
    }

    // --- JSON ---
    if (detectedType === "json" || name.endsWith(".json")) {
      const result = await parseJson(file)
      return NextResponse.json({
        fileType: "json",
        rows: result.rows,
        errors: result.errors,
      })
    }

    // --- DOCX ---
    if (detectedType === "docx" || name.match(/\.(docx|doc)$/)) {
      const buffer = await file.arrayBuffer()
      const result = await parseDocx(buffer)
      return NextResponse.json({
        fileType: "docx",
        rawText: result.text,
        errors: result.errors,
      })
    }

    // --- PDF ---
    if (detectedType === "pdf" || name.endsWith(".pdf")) {
      const buffer = await file.arrayBuffer()
      const result = await parsePdf(buffer)
      return NextResponse.json({
        fileType: "pdf",
        rawText: result.text,
        pageCount: result.pageCount,
        errors: result.errors,
      })
    }

    return NextResponse.json(
      { error: `Unsupported file type: ${name}` },
      { status: 400 }
    )
  } catch (error: any) {
    console.error("Parse file error:", error)
    return NextResponse.json(
      { error: `Server error: ${error.message}` },
      { status: 500 }
    )
  }
}

function detectFileType(name: string): string {
  if (name.endsWith(".csv")) return "csv"
  if (name.match(/\.(xlsx|xls|xlsb)$/)) return "xlsx"
  if (name.endsWith(".json")) return "json"
  if (name.match(/\.(docx|doc)$/)) return "docx"
  if (name.endsWith(".pdf")) return "pdf"
  return "unknown"
}
