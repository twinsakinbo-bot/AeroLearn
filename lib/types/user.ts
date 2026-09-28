export interface UserProfile {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  role: "student" | "admin"
  learningMode?: "school" | "exam" | "self_learning" | null
  classLevel?: "JSS 1" | "JSS 2" | "JSS 3" | "SS 1" | "SS 2" | "SS 3" | null
  subjects?: string[]
  examType?: "WAEC" | "NECO" | "JAMB" | "Other" | null
  onboardingCompleted: boolean
  xp: number
  streak: number
  longestStreak: number
  lastActiveDate?: string
  completedLessons?: string[]
  completedTopics?: string[]
  completedQuizzes?: string[]
  homeworkCompleted?: number
  totalQuestionsAnswered?: number
  totalQuestionsCorrect?: number
  subjectsStudied?: string[]
  perfectQuizzes?: number
  badges?: string[]
  favoriteSubjects?: string[]
  schoolName?: string
  coins?: number
  purchasedItems?: string[]
  equippedFrame?: string
  equippedTheme?: string
  equippedTitle?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface UserProgress {
  uid: string
  subject: string
  topic: string
  classLevel: string
  status: "not_started" | "in_progress" | "completed"
  score?: number
  timeSpent?: number
  completedAt?: Date
  updatedAt?: Date
}
