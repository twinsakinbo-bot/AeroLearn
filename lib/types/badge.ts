export interface Badge {
  id: string
  name: string
  description: string
  icon: string
  requirement: {
    type: "lessons_completed" | "quizzes_completed" | "total_xp" | "streak" | "questions_answered" | "homework_completed" | "subjects_studied" | "perfect_quizzes"
    value: number
  }
}

export interface UserBadge {
  badgeId: string
  earnedAt: Date
}
