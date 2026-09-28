/**
 * DOCX Parser — uses Mammoth to extract text from Word documents.
 *
 * This file is intended to be imported ONLY in Next.js API routes
 * (server-side).  Mammoth uses Node-specific APIs that don't work in
 * the browser.
 */
import mammoth from "mammoth"

export interface DocxParseResult {
  text: string
  errors: string[]
}

/**
 * Extract the full text content of a DOCX file.
 *
 * @param buffer  An ArrayBuffer or Buffer containing the DOCX data.
 */
export async function parseDocx(
  buffer: ArrayBuffer | Buffer
): Promise<DocxParseResult> {
  const errors: string[] = []

  try {
    const result = await mammoth.extractRawText({
      buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
    })

    if (result.messages && result.messages.length > 0) {
      result.messages.forEach((m) => errors.push(m.toString()))
    }

    return { text: result.value, errors }
  } catch (e: any) {
    errors.push(`DOCX parse error: ${e.message}`)
    return { text: "", errors }
  }
}

export function isDocxFile(file: File): boolean {
  return (
    file.type.includes("word") ||
    file.name.toLowerCase().match(/\.(docx|doc)$/) !== null
  )
}
