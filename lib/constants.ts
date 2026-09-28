export const LEARNING_MODES = {
  SCHOOL: "school",
  EXAM: "exam",
  SELF_LEARNING: "self_learning",
} as const

export type LearningMode = typeof LEARNING_MODES[keyof typeof LEARNING_MODES]

export const CLASS_LEVELS = [
  "JSS 1",
  "JSS 2",
  "JSS 3",
  "SS 1",
  "SS 2",
  "SS 3",
] as const

export type ClassLevel = typeof CLASS_LEVELS[number]

export const EXAM_TYPES = [
  "WAEC",
  "NECO",
  "JAMB",
  "Other",
] as const

export type ExamType = typeof EXAM_TYPES[number]

export const DEPARTMENTS = ["Science", "Art", "Commercial"] as const
export type Department = typeof DEPARTMENTS[number]

// JSS1–JSS3 subjects
export const JSS_SUBJECTS = [
  "English Language",
  "Mathematics",
  "Basic Science",
  "Basic Technology",
  "Social Studies",
  "Civic Education",
  "Agricultural Science",
  "French Language",
  "CRS / IRK",
  "Creative Arts",
  "Computer Studies",
  "Physical & Health Education",
  "Yoruba",
] as const
export type JssSubject = typeof JSS_SUBJECTS[number]

// SS subjects per department
export const SS_SUBJECTS_BY_DEPARTMENT: Record<Department, string[]> = {
  Science: [
    "English Language",
    "Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "Further Mathematics",
    "Agricultural Science",
    "Computer Science",
    "Geography",
    "Civic Education",
  ],
  Art: [
    "English Language",
    "Mathematics",
    "Literature-in-English",
    "Government",
    "History",
    "CRS / IRK",
    "Yoruba",
    "Igbo",
    "Hausa",
    "Fine Art",
    "Music",
    "Civic Education",
  ],
  Commercial: [
    "English Language",
    "Mathematics",
    "Economics",
    "Accounting",
    "Commerce",
    "Government",
    "Civic Education",
    "Geography",
    "Computer Science",
    "Yoruba",
  ],
}

// Flat list for admin/question panels (all subjects combined)
export const SUBJECTS = [
  "Mathematics",
  "English Language",
  "Biology",
  "Chemistry",
  "Physics",
  "Economics",
  "Government",
  "Geography",
  "Literature-in-English",
  "Civic Education",
  "Computer Science",
  "Further Mathematics",
  "Agricultural Science",
  "Accounting",
  "Commerce",
  "Basic Science",
  "Basic Technology",
  "Social Studies",
  "History",
  "CRS / IRK",
  "Creative Arts",
  "French Language",
  "Physical & Health Education",
  "Fine Art",
  "Music",
  "Yoruba",
  "Igbo",
  "Hausa",
] as const
export type Subject = typeof SUBJECTS[number]

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const
export type Difficulty = typeof DIFFICULTIES[number]

export const XP_REWARDS = {
  COMPLETE_LESSON: 10,
  COMPLETE_PRACTICE: 15,
  COMPLETE_QUIZ: 20,
  COMPLETE_HOMEWORK: 25,
  DAILY_STREAK: 5,
  PERFECT_QUIZ: 10,
} as const

export const BADGES = [
  { id: "first_lesson", name: "First Lesson", description: "Complete your first lesson", icon: "🎓", requirement: { type: "lessons_completed", value: 1 } },
  { id: "first_quiz", name: "Quiz Taker", description: "Complete your first quiz", icon: "📝", requirement: { type: "quizzes_completed", value: 1 } },
  { id: "xp_100", name: "Century", description: "Earn 100 XP", icon: "💯", requirement: { type: "total_xp", value: 100 } },
  { id: "streak_7", name: "Week Warrior", description: "Maintain a 7-day streak", icon: "🔥", requirement: { type: "streak", value: 7 } },
  { id: "questions_50", name: "Question Master", description: "Answer 50 questions", icon: "🏅", requirement: { type: "questions_answered", value: 50 } },
  { id: "homework_hero", name: "Homework Hero", description: "Complete 5 homework assignments", icon: "📋", requirement: { type: "homework_completed", value: 5 } },
  { id: "subject_explorer", name: "Subject Explorer", description: "Study 3 different subjects", icon: "🗺️", requirement: { type: "subjects_studied", value: 3 } },
  { id: "perfect_quiz", name: "Perfect Score", description: "Get 100% on a quiz", icon: "🌟", requirement: { type: "perfect_quizzes", value: 1 } },
] as const

export type Badge = typeof BADGES[number]

export const DEFAULT_USER = {
  learningMode: null as LearningMode | null,
  classLevel: null as ClassLevel | null,
  subjects: [] as Subject[],
  examType: null as ExamType | null,
  onboardingCompleted: false,
  xp: 0,
  streak: 0,
  longestStreak: 0,
  lastActiveDate: null as string | null,
  completedLessons: [] as string[],
  completedTopics: [] as string[],
  completedQuizzes: [] as string[],
  homeworkCompleted: 0,
  totalQuestionsAnswered: 0,
  totalQuestionsCorrect: 0,
  subjectsStudied: [] as string[],
  perfectQuizzes: 0,
  badges: [] as string[],
}
