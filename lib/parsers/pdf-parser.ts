/**
 * PDF Parser — uses pdf-parse to extract text from PDF files.
 *
 * This file is intended to be imported ONLY in Next.js API routes
 * (server-side).  pdf-parse depends on Node libraries that don't
 * work in the browser.
 */

export interface PdfParseResult {
  text: string
  errors: string[]
  pageCount?: number
}

/**
 * Extract text from a PDF Buffer.
 *
 * @param buffer  A Buffer or ArrayBuffer containing the PDF data.
 */
export async function parsePdf(
  buffer: ArrayBuffer | Buffer
): Promise<PdfParseResult> {
  const errors: string[] = []

  try {
    // pdf-parse is dynamically imported to avoid SSR / build-time issues
    const pdfParseModule = await import("pdf-parse")
    const pdfParse = (pdfParseModule.default || pdfParseModule) as (
      data: Buffer
    ) => Promise<{ text: string; numpages?: number }>
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)

    const data = await pdfParse(buf)

    if (data.text && data.text.trim().length > 0) {
      return {
        text: data.text,
        pageCount: data.numpages,
        errors,
      }
    }

    errors.push("PDF appears to be scanned / image-only — no selectable text found.")
    return { text: "", pageCount: data.numpages, errors }
  } catch (e: any) {
    errors.push(`PDF parse error: ${e.message}`)
    return { text: "", errors }
  }
}

export function isPdfFile(file: File): boolean {
  return file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")
}
