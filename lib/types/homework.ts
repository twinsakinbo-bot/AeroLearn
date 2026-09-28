export type HomeworkStatus = "assigned" | "in_progress" | "submitted" | "graded" | "completed"

export interface Homework {
  id?: string
  title: string
  description: string
  classLevel: string
  subject: string
  topic: string
  questions: HomeworkQuestion[]
  dueDate: Date
  createdBy: string
  status: "draft" | "published" | "closed"
  createdAt?: Date
  updatedAt?: Date
}

export interface HomeworkQuestion {
  id: string
  question: string
  options: { A: string; B: string; C: string; D: string }
  correctAnswer: "A" | "B" | "C" | "D"
  explanation?: string
}

export interface HomeworkSubmission {
  id?: string
  homeworkId: string
  studentId: string
  studentName: string
  answers: Record<string, "A" | "B" | "C" | "D">
  score: number
  totalQuestions: number
  submittedAt: Date
  gradedAt?: Date
  feedback?: string
  status: HomeworkStatus
}
