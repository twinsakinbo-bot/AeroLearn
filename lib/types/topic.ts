export interface Topic {
  id?: string
  classLevel: string
  subject: string
  title: string
  description?: string
  order: number
  difficulty: "beginner" | "intermediate" | "advanced"
  estimatedMinutes?: number
  isPublished: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface LearningPath {
  classLevel: string
  subject: string
  topics: Topic[]
}
