import { Timestamp } from "@/lib/db"

export type ExamType = "wace" | "jamb" | "neco" | "sat" | "gre" | "sat" | "waec" | "igcse" | "a-level" | "ib" | string

export type Difficulty = "Easy" | "Medium" | "Hard"

export interface QuestionOptions {
  A: string
  B: string
  C: string
  D: string
}

/**
 * Standard PracticeQuestion format stored in Firestore.
 * This is the canonical shape every parsed source is normalized into.
 */
export interface PracticeQuestion {
  /** Firestore document id (populated on read) */
  id?: string
  /** Auto-or-manual question reference, same as Firestore id */
  questionId?: string
  exam: string
  year: number
  subject: string
  topic?: string
  questionNumber?: number
  question: string
  options: QuestionOptions
  correctAnswer: "A" | "B" | "C" | "D"
  explanation?: string
  paper?: string
  difficulty?: Difficulty
  source?: string
  /** Admin audit metadata; never affects the answer or question shown to students. */
  aiReviewStatus?: "clear" | "needs-review" | "edited"
  aiReviewReason?: string | null
  aiReviewedAt?: Timestamp | Date
  createdAt?: Timestamp | Date
  updatedAt?: Timestamp | Date
  /** Internal: used during edit/preview flows */
  _originalIndex?: number
}

/** Raw row from any parser before normalization */
export type RawRow = Record<string, unknown>

export interface ParsedFileResult {
  rows: RawRow[]
  worksheetNames?: string[]
  rawText?: string
  fileType: "csv" | "xlsx" | "json" | "docx" | "pdf"
}

export interface ValidationError {
  row: number
  field: string
  message: string
  severity: "error" | "warning"
}

export interface ValidationResult {
  totalRows: number
  validQuestions: PracticeQuestion[]
  errors: Record<number, ValidationError[]>
  duplicates: number[]
  blankRows: number[]
  duplicateQuestionIndices: number[]
}

/** Column-name aliases that map to canonical field names */
export const COLUMN_ALIASES: Record<string, string[]> = {
  exam: ["exam", "standard", "board", "examination", "test"],
  year: ["year", "examyear", "exam_year", "sessionyear", "session"],
  subject: ["subject", "topic_name", "subject_name", "discipline"],
  question: ["question", "questiontext", "question_text", "question_no", "questionno", "q"],
  optionA: ["optiona", "option_a", "a", "choicea", "choice_a", "opt_a"],
  optionB: ["optionb", "option_b", "b", "choiceb", "choice_b", "opt_b"],
  optionC: ["optionc", "option_c", "c", "choicec", "choice_c", "opt_c"],
  optionD: ["optiond", "option_d", "d", "choiced", "choice_d", "opt_d"],
  correctAnswer: ["correctanswer", "correct_answer", "answer", "correct", "key"],
  explanation: ["explanation", "explain", "solution", "reason"],
  paper: ["paper", "paper_no", "paperno", "paper_type"],
  difficulty: ["difficulty", "level"],
  topic: ["topic", "topicname", "topic_name", "subtopic"],
  source: ["source", "src", "origin"],
  questionNumber: ["questionnumber", "question_number", "questionno", "no"],
}

/** Normalise a string for case/whitespace-insensitive comparison */
export function normalizeString(str: string): string {
  return String(str ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}
