import { normalizeString } from "../types/question"

/**
 * Generate a stable fingerprint for a question to detect duplicates.
 *
 * Uses exam + year + subject + normalised question text.
 */
export function generateFingerprint(q: {
  exam: string
  year: number
  subject: string
  question: string
}): string {
  const parts = [
    normalizeString(q.exam || ""),
    String(q.year || ""),
    normalizeString(q.subject || ""),
    normalizeString(q.question || ""),
  ]
  return parts.join("|")
}

/**
 * Check whether two questions are duplicates by comparing fingerprints.
 */
export function isDuplicate(a: {
  exam: string
  year: number
  subject: string
  question: string
}, b: {
  exam: string
  year: number
  subject: string
  question: string
}): boolean {
  return generateFingerprint(a) === generateFingerprint(b)
}
