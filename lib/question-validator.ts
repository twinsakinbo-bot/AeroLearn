/**
 * Question Validator
 *
 * Checks every normalised question for:
 *   • Required fields (exam, year, subject, question, all 4 options, correctAnswer)
 *   • Empty questions
 *   • Invalid year
 *   • Invalid correct answer (must be A–D)
 *   • Missing/empty options
 *   • Duplicate questions within the dataset
 *   • Completely blank rows
 */
import {
  PracticeQuestion,
  ValidationError,
  ValidationResult,
} from "./types/question"
import { generateFingerprint } from "./utils/fingerprint"

const CURRENT_YEAR = new Date().getFullYear()

/**
 * Validate a single question.  Returns all errors found.
 */
export function validateQuestion(
  question: PracticeQuestion,
  rowIndex: number
): ValidationError[] {
  const errors: ValidationError[] = []

  // --- Blank row check ---
  const qText = (question.question || "").trim()
  const hasAnyOption =
    (question.options.A || "").trim().length > 0 ||
    (question.options.B || "").trim().length > 0 ||
    (question.options.C || "").trim().length > 0 ||
    (question.options.D || "").trim().length > 0

  /**
   * Judged on the row's own content only. This used to also require `!exam` and
   * `!subject`, but the normaliser fills both from the upload form before
   * validation runs — so they are never empty, no row was ever recognised as
   * blank, and the trailing empty line every spreadsheet has reported six
   * separate errors instead of being quietly ignored.
   */
  if (!qText && !hasAnyOption) {
    return [{ row: rowIndex, field: "__blank", message: "Completely blank row", severity: "warning" }]
  }

  // --- Required fields ---
  if (!question.exam || question.exam.trim() === "") {
    errors.push({ row: rowIndex, field: "exam", message: "Missing exam", severity: "error" })
  }

  if (!question.year || question.year <= 1900 || question.year > CURRENT_YEAR + 10) {
    errors.push({ row: rowIndex, field: "year", message: `Invalid year (${question.year || "empty"})`, severity: "error" })
  }

  if (!question.subject || question.subject.trim() === "") {
    errors.push({ row: rowIndex, field: "subject", message: "Missing subject", severity: "error" })
  }

  if (!qText) {
    errors.push({ row: rowIndex, field: "question", message: "Question text is empty", severity: "error" })
  }

  // --- Options ---
  const letters: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"]
  letters.forEach((letter) => {
    const val = question.options[letter] || ""
    if (!val.trim()) {
      errors.push({ row: rowIndex, field: `option${letter}`, message: `Missing option ${letter}`, severity: "error" })
    }
  })

  // --- Correct answer ---
  const ca = question.correctAnswer
  if (!ca || !["A", "B", "C", "D"].includes(ca)) {
    errors.push({
      row: rowIndex,
      field: "correctAnswer",
      message: `Invalid correct answer "${ca}"`,
      severity: "error",
    })
  } else {
    // Check that the correct option actually has text
    const correctOptionText = question.options[ca] || ""
    if (!correctOptionText.trim()) {
      errors.push({
        row: rowIndex,
        field: "correctAnswer",
        message: `Correct answer (${ca}) is blank`,
        severity: "error",
      })
    }
  }

  // --- Difficulty ---
  if (question.difficulty && !["Easy", "Medium", "Hard"].includes(question.difficulty)) {
    errors.push({
      row: rowIndex,
      field: "difficulty",
      message: `Invalid difficulty "${question.difficulty}"`,
      severity: "warning",
    })
  }

  return errors
}

/**
 * Run validation across all normalised questions.
 *
 * Performs two passes:
 *   1. Per-question field validation (required fields, types, etc.)
 *   2. Cross-question duplicate detection
 */
export function validateQuestions(
  questions: PracticeQuestion[]
): ValidationResult {
  const errors: Record<number, ValidationError[]> = {}
  const duplicates: number[] = []
  const blankRows: number[] = []
  /* Carries the original index. Filtering by position alone was wrong: the list
     is compacted as invalid rows are skipped, so its indices stop matching the
     row numbers in `duplicates` the moment one row fails, and the wrong entries
     were removed — usually none, leaving duplicates counted as valid. */
  const kept: { index: number; question: PracticeQuestion }[] = []

  const fingerprints = new Map<string, number>() // fingerprint → first seen index

  questions.forEach((question, index) => {
    const rowIdx = index + 2 // +2 because row 1 = header, data starts at row 2
    const errs = validateQuestion(question, rowIdx)

    if (errs.length > 0) {
      errors[rowIdx] = errs

      const hasBlank = errs.some((e) => e.field === "__blank")
      if (hasBlank) {
        blankRows.push(index)
        /* A blank row carries only a warning, so without this it fell through to
           `validQuestions` and an empty question was imported. */
        return
      }

      const hasError = errs.some((e) => e.severity === "error")
      if (hasError) {
        return // skip invalid questions
      }
    }

    // Duplicate detection (fingerprint based)
    const fp = generateFingerprint({
      exam: question.exam,
      year: question.year,
      subject: question.subject,
      question: question.question,
    })

    if (fingerprints.has(fp)) {
      duplicates.push(index)
      errors[rowIdx] = [
        ...(errors[rowIdx] || []),
        {
          row: rowIdx,
          field: "__duplicate",
          message: `Duplicate of row ${fingerprints.get(fp)! + 2}`,
          severity: "warning",
        },
      ]
    } else {
      fingerprints.set(fp, index)
    }

    kept.push({ index, question })
  })

  // Duplicates are flagged, not removed from the preview — the admin decides.
  const duplicateSet = new Set(duplicates)
  const nonDuplicateValid = kept
    .filter((entry) => !duplicateSet.has(entry.index))
    .map((entry) => entry.question)

  return {
    totalRows: questions.length,
    validQuestions: nonDuplicateValid,
    errors,
    duplicates,
    blankRows,
    duplicateQuestionIndices: duplicates,
  }
}
