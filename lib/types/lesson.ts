import { Timestamp } from "@/lib/db"
import { PracticeQuestion } from "./question"

export type TermLevel = "Beginner" | "Intermediate" | "Advanced"

/**
 * Teaching order for a lesson's `term`.
 *
 * The field is typed as `TermLevel`, but the importers never enforced it: real
 * documents carry "First Term", "1st term", "Term 2" and the three words above.
 * Sorting on the string alphabetically puts "Advanced" first, so rank instead.
 * Anything unrecognised sorts last rather than being silently grouped with the
 * hardest material.
 */
export function termRank(term: string): 1 | 2 | 3 | 4 {
  const value = term.toLowerCase()
  if (value.includes("first") || value.includes("1") || value.includes("beginner")) return 1
  if (value.includes("second") || value.includes("2") || value.includes("intermediate")) return 2
  if (value.includes("third") || value.includes("3") || value.includes("advanced")) return 3
  return 4
}

export interface LessonExample {
  title?: string
  content: string
}

export interface Lesson {
  id?: string
  subject: string
  classLevel: string // e.g., "JSS 1", "SS 2"
  term: TermLevel
  topicTitle: string
  chapter?: number // Position in the published curriculum plan.
  content: string // Markdown formatted notes
  examples?: LessonExample[]
  homework?: PracticeQuestion[] // We can reuse the PracticeQuestion type for homework!
  videoUrl?: string // Support for rich media/videos
  createdAt?: Timestamp | Date
  updatedAt?: Timestamp | Date
}

export interface LessonValidationError {
  index: number
  field: string
  message: string
  severity: "error" | "warning"
}

export interface LessonValidationResult {
  totalLessons: number
  validLessons: Lesson[]
  errors: Record<number, LessonValidationError[]>
}
