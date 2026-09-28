/**
 * Text-to-Question Parser
 *
 * Attempts to parse structured questions from plain text (extracted from
 * PDF or DOCX files). Uses regex patterns to detect common formats:
 *
 * Format A (numbered, vertical options):
 *   1. What is 2+2?
 *   A. 3
 *   B. 4
 *   C. 5
 *   D. 6
 *   Answer: B
 *
 * Format B (labeled with inline options):
 *   Question 1: What is 2+2? (A) 3 (B) 4 (C) 5 (D) 6
 *   Answer: B
 */
import { PracticeQuestion, RawRow } from "@/lib/types/question"

/** Extract rows from raw text using pattern matching. */
export function parseTextToRows(text: string): RawRow[] {
  const rows: RawRow[] = []

  // ---- Pattern A: Numbered questions with vertical options ----
  // 1. Question text
  //    A. option A
  //    B. option B
  //    C. option C
  //    D. option D
  //    Answer: B
  //
  // Also supports (A), (B), etc. and "Answer: B" or "Ans: B"

  const questionRegexA = /(?:\d+[\.\)]\s*|\bQuestion\s*\d+[\:\)]\s*|\bQ\.\s*|\bQ\d*\s*[\.\)]\s*)([\s\S]*?)(?=\n\s*(?:\d+[\.\)]|\bQuestion\s*\d+|\bQ\.|\bQ\d*\s*[\.\)]|$))/g

  // Better: split by question markers
  const blocks = text.split(/\n\s*(?=\d+[\.\)]\s|\bQuestion\s*\d+[\:\.]\s|\bQ\.\s*|\bQ\d*\s*[\.\)]\s)/gi)

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed || trimmed.length < 5) continue

    // Try pattern A: question on first line, options below, answer at end
    const lines = trimmed.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)

    if (lines.length < 2) continue

    // Try to match options and answer
    const options: string[] = []
    let answer: string | null = null
    let questionText = ""

    // Check if first line is the question
    const firstLine = lines[0]
    // Remove leading number/prefix from question
    const qMatch = firstLine.match(/(?:\d+[\.\)]\s*|\bQuestion\s*\d+[\:\.\)]\s*|\bQ\.\s*|\bQ\d*\s*[\.\)]\s*)(.*)/i)
    questionText = qMatch ? qMatch[1] : firstLine

    // Scan remaining lines for options and answer
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]

      // Match options: A. text, (A) text, A) text
      const optMatch = line.match(/^[\(\[]?\s*([A-D])[\.\)\]]\s*(.+)$/i)
      if (optMatch) {
        const letter = optMatch[1].toUpperCase()
        const text = optMatch[2].trim()
        const idx = "ABCD".indexOf(letter)
        if (idx >= 0 && idx < 4) {
          while (options.length <= idx) options.push("")
          options[idx] = text
          continue
        }
      }

      // Match answer: Answer: B, Ans: B, ANSWER: B
      const ansMatch = line.match(/^(?:Answer|Ans|ANSWER|Key|KEY)\s*[\:\)]\s*([A-D])/i)
      if (ansMatch) {
        answer = ansMatch[1].toUpperCase()
        continue
      }
    }

    // Only accept if we found at least 2 options and an answer
    if (options.length >= 2 && answer && questionText.length > 5) {
      rows.push({
        question: questionText,
        optionA: options[0] || "",
        optionB: options[1] || "",
        optionC: options[2] || "",
        optionD: options[3] || "",
        correctAnswer: answer,
      })
    }
  }

  // ---- Pattern B: All on one line ----
  // Question 1: What is 2+2? (A) 3 (B) 4 (C) 5 (D) 6 Answer: B
  const patternB = /(?:Question\s*\d+[\:\.\)]\s*|\d+[\.\)]\s*|\bQ\.\s*|\bQ\d*\s*[\.\)]\s*)([^?]*\??)\s*(?:\(A\)\s*|\bA\.\s*|\bA\)\s*)([^\(]+?)\s*(?:\(B\)\s*|\bB\.\s*|\bB\)\s*)([^\(]+?)\s*(?:\(C\)\s*|\bC\.\s*|\bC\)\s*)([^\(]+?)\s*(?:\(D\)\s*|\bD\.\s*|\bD\)\s*)([^\(\n]+?)\s*(?:Answer|Ans|ANSWER|Key)?\s*[\:\)]\s*([A-D])/gi

  if (rows.length === 0) {
    // Only try pattern B if pattern A didn't find anything
    let match: RegExpExecArray | null
    while ((match = patternB.exec(text)) !== null) {
      rows.push({
        question: match[1].trim(),
        optionA: match[2].trim(),
        optionB: match[3].trim(),
        optionC: match[4].trim(),
        optionD: match[5].trim(),
        correctAnswer: match[6].toUpperCase(),
      })
    }
  }

  return rows
}

/** Type alias for convenience */
export type { PracticeQuestion, RawRow }
