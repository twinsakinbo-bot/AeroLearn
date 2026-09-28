import { getSupabase } from "./supabase"
import { lessons as seedLessons, questions as seedQuestions, subjectColor } from "./data"
import type { SubjectColor } from "./data"

export type RemoteLesson = {
  id: string
  subject: string
  classLevel: string
  term: string
  topicTitle: string
  content: string
  examples?: { title?: string; content: string }[]
  videoUrl?: string
  updatedAt?: string
}

export type RemoteQuestion = {
  id: string
  exam: string
  year: number
  subject: string
  topic?: string
  question: string
  options: { A: string; B: string; C: string; D: string }
  correctAnswer: "A" | "B" | "C" | "D"
  explanation?: string
  difficulty?: string
}

const DOWNLOAD_KEY = "aerolearn-desktop-downloads-v1"

type DownloadCache = {
  lessons: Record<string, RemoteLesson>
  questions: Record<string, RemoteQuestion[]>
  savedAt: Record<string, string>
}

function loadCache(): DownloadCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(DOWNLOAD_KEY) || "null")
    if (!parsed || typeof parsed !== "object") return { lessons: {}, questions: {}, savedAt: {} }
    return { lessons: parsed.lessons || {}, questions: parsed.questions || {}, savedAt: parsed.savedAt || {} }
  } catch {
    return { lessons: {}, questions: {}, savedAt: {} }
  }
}

function saveCache(cache: DownloadCache) {
  localStorage.setItem(DOWNLOAD_KEY, JSON.stringify(cache))
}

function seedAsRemote(): RemoteLesson[] {
  return seedLessons.map((lesson) => ({
    id: lesson.id,
    subject: lesson.subject,
    classLevel: "SS 1",
    term: "First",
    topicTitle: lesson.title,
    content: lesson.reading,
    examples: lesson.topics.map((topic) => ({ title: topic, content: `A short worked example on ${topic.toLowerCase()}.` })),
  }))
}

function seedQuestionsAsRemote(): RemoteQuestion[] {
  return seedQuestions.map((question) => {
    const [a, b, c, d] = question.options
    const letters = ["A", "B", "C", "D"] as const
    return {
      id: question.id,
      exam: "AeroLearn",
      year: new Date().getFullYear(),
      subject: question.subject,
      topic: question.topic,
      question: question.prompt,
      options: { A: a, B: b, C: c, D: d },
      correctAnswer: letters[question.answerIndex],
      explanation: question.explanation,
      difficulty: "Medium",
    }
  })
}

export async function fetchLessons(opts?: { classLevel?: string; subject?: string }): Promise<{ lessons: RemoteLesson[]; source: "supabase" | "cache" | "demo" }> {
  const supabase = getSupabase()
  if (supabase) {
    try {
      let query = supabase.from("lessons").select("id, data, updated_at").order("updated_at", { ascending: false }).limit(200)
      if (opts?.classLevel) query = query.eq("data->>classLevel", opts.classLevel)
      if (opts?.subject) query = query.eq("data->>subject", opts.subject)
      const { data, error } = await query
      if (!error && data) {
        const rows: RemoteLesson[] = data.map((row: any) => ({
          id: row.id,
          subject: row.data?.subject ?? "Unknown",
          classLevel: row.data?.classLevel ?? "",
          term: row.data?.term ?? "",
          topicTitle: row.data?.topicTitle ?? "Untitled lesson",
          content: row.data?.content ?? "",
          examples: row.data?.examples,
          videoUrl: row.data?.videoUrl,
          updatedAt: row.updated_at,
        }))
        if (rows.length) return { lessons: rows, source: "supabase" }
      }
    } catch {
      /* fall through to cache */
    }
  }
  const cache = loadCache()
  const cached = Object.values(cache.lessons).filter((lesson) => {
    if (opts?.classLevel && lesson.classLevel !== opts.classLevel) return false
    if (opts?.subject && lesson.subject !== opts.subject) return false
    return true
  })
  if (cached.length) return { lessons: cached, source: "cache" }
  const demo = seedAsRemote().filter((lesson) => {
    if (opts?.subject && lesson.subject !== opts.subject) return false
    return true
  })
  return { lessons: demo, source: "demo" }
}

export async function fetchLesson(id: string): Promise<{ lesson: RemoteLesson | null; source: "supabase" | "cache" | "demo" }> {
  const cache = loadCache()
  if (cache.lessons[id]) return { lesson: cache.lessons[id], source: "cache" }
  const supabase = getSupabase()
  if (supabase) {
    try {
      const { data, error } = await supabase.from("lessons").select("id, data, updated_at").eq("id", id).maybeSingle()
      if (!error && data) {
        const lesson: RemoteLesson = {
          id: (data as any).id,
          subject: (data as any).data?.subject ?? "Unknown",
          classLevel: (data as any).data?.classLevel ?? "",
          term: (data as any).data?.term ?? "",
          topicTitle: (data as any).data?.topicTitle ?? "Untitled",
          content: (data as any).data?.content ?? "",
          examples: (data as any).data?.examples,
          videoUrl: (data as any).data?.videoUrl,
          updatedAt: (data as any).updated_at,
        }
        return { lesson, source: "supabase" }
      }
    } catch {
      /* fall through */
    }
  }
  const demo = seedAsRemote().find((lesson) => lesson.id === id)
  return { lesson: demo || null, source: "demo" }
}

export async function fetchQuestions(opts?: { subject?: string; limit?: number }): Promise<{ questions: RemoteQuestion[]; source: "supabase" | "cache" | "demo" }> {
  const supabase = getSupabase()
  if (supabase) {
    try {
      let query = supabase.from("practice_questions").select("id, data").limit(opts?.limit ?? 20)
      if (opts?.subject) query = query.eq("data->>subject", opts.subject)
      const { data, error } = await query
      if (!error && data) {
        const rows: RemoteQuestion[] = data.map((row: any) => ({
          id: row.id,
          exam: row.data?.exam ?? "Practice",
          year: row.data?.year ?? new Date().getFullYear(),
          subject: row.data?.subject ?? "Unknown",
          topic: row.data?.topic,
          question: row.data?.question ?? "",
          options: row.data?.options ?? { A: "", B: "", C: "", D: "" },
          correctAnswer: row.data?.correctAnswer ?? "A",
          explanation: row.data?.explanation,
          difficulty: row.data?.difficulty,
        }))
        if (rows.length) return { questions: rows, source: "supabase" }
      }
    } catch {
      /* fall through */
    }
  }
  const cache = loadCache()
  const cached = Object.values(cache.questions).flat().filter((question) => (opts?.subject ? question.subject === opts.subject : true))
  if (cached.length) return { questions: cached.slice(0, opts?.limit ?? cached.length), source: "cache" }
  const demo = seedQuestionsAsRemote().filter((question) => (opts?.subject ? question.subject === opts.subject : true))
  return { questions: demo.slice(0, opts?.limit ?? demo.length), source: "demo" }
}

export async function downloadLesson(lesson: RemoteLesson): Promise<{ questions: number }> {
  const cache = loadCache()
  cache.lessons[lesson.id] = lesson
  cache.savedAt[lesson.id] = new Date().toISOString()
  const supabase = getSupabase()
  let questionCount = 0
  if (supabase) {
    try {
      const { data } = await supabase
        .from("practice_questions")
        .select("id, data")
        .eq("data->>subject", lesson.subject)
        .limit(10)
      if (data && data.length) {
        cache.questions[lesson.id] = data.map((row: any) => ({
          id: row.id,
          exam: row.data?.exam ?? "Practice",
          year: row.data?.year ?? new Date().getFullYear(),
          subject: row.data?.subject ?? lesson.subject,
          topic: row.data?.topic,
          question: row.data?.question ?? "",
          options: row.data?.options ?? { A: "", B: "", C: "", D: "" },
          correctAnswer: row.data?.correctAnswer ?? "A",
          explanation: row.data?.explanation,
        }))
        questionCount = data.length
      }
    } catch {
      /* offline — skip questions */
    }
  }
  if (!questionCount) {
    const fallback = seedQuestionsAsRemote().filter((question) => question.subject === lesson.subject).slice(0, 5)
    if (fallback.length) {
      cache.questions[lesson.id] = fallback
      questionCount = fallback.length
    }
  }
  saveCache(cache)
  return { questions: questionCount }
}

export function removeDownloaded(lessonId: string) {
  const cache = loadCache()
  delete cache.lessons[lessonId]
  delete cache.questions[lessonId]
  delete cache.savedAt[lessonId]
  saveCache(cache)
}

export function isDownloaded(lessonId: string): boolean {
  return Boolean(loadCache().lessons[lessonId])
}

export function downloadedList(): { lesson: RemoteLesson; savedAt: string }[] {
  const cache = loadCache()
  return Object.values(cache.lessons).map((lesson) => ({ lesson, savedAt: cache.savedAt[lesson.id] || "" }))
}

export function colorFor(subject: string): SubjectColor {
  return (subjectColor as Record<string, SubjectColor>)[subject] || "cyan"
}
