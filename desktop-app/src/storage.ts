import {
  challenges,
  communitySeed,
  messageSeed,
  timetableSeed,
  type Subject,
} from "./data"

export type HomeworkItem = {
  id: string
  title: string
  subject: Subject
  dueDate: string
  done: boolean
  notes: string
}

export type NoteItem = {
  id: string
  title: string
  body: string
  subject: Subject
  updatedAt: string
}

export type TimetableSlot = {
  id: string
  day: string
  start: string
  subject: Subject
  note: string
}

export type MockResult = {
  id: string
  subject: Subject | "Mixed"
  score: number
  total: number
  takenAt: string
  seconds: number
}

export type EssaySubmission = {
  id: string
  title: string
  prompt: string
  wordCount: number
  score: number
  feedback: string[]
  strengths: string[]
  submittedAt: string
}

export type ChallengeState = { id: string; startedAt: string; completedAt?: string }

export type CommunityReply = { id: string; author: string; body: string; at: string }
export type CommunityThread = {
  id: string
  title: string
  author: string
  subject: Subject
  body: string
  createdAt: string
  replies: CommunityReply[]
  liked: boolean
}

export type MessageThread = {
  id: string
  with: string
  role: string
  color: string
  messages: { id: string; from: "them" | "you"; text: string; at: string }[]
}

export type DesktopProfile = {
  name: string
  classLevel: string
  goal: string
  onboardingComplete: boolean
  completedLessons: string[]
  practicePoints: number
  coins: number
  xp: number
  streak: number
  lastStudyDate?: string
  homework: HomeworkItem[]
  notes: NoteItem[]
  timetable: TimetableSlot[]
  mockResults: MockResult[]
  essays: EssaySubmission[]
  weakTopics: Record<string, { subject: Subject; misses: number; last: string }>
  challenges: ChallengeState[]
  storeOwned: string[]
  activeFrame: string
  activeTheme: string
  community: CommunityThread[]
  messages: MessageThread[]
  focusMinutesToday: number
  focusDate?: string
}

const KEY = "aerolearn-desktop-profile-v2"

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
}

function seedNotes(): NoteItem[] {
  return [
    {
      id: id("note"),
      title: "Welcome to your notebook",
      body: "Everything you type here stays on this device. Use it for lesson takeaways, formulas you want to remember, or a quick brain-dump before an exam.",
      subject: "English",
      updatedAt: new Date().toISOString(),
    },
  ]
}

function seedTimetable(): TimetableSlot[] {
  return timetableSeed.map((slot) => ({ id: id("slot"), ...slot }))
}

function seedCommunity(): CommunityThread[] {
  const now = new Date().toISOString()
  return communitySeed.map((thread) => ({
    id: thread.id,
    title: thread.title,
    author: thread.author,
    subject: thread.subject,
    body: thread.excerpt,
    createdAt: now,
    liked: false,
    replies: thread.replies.map((reply) => ({ id: id("reply"), author: reply.author, body: reply.body, at: now })),
  }))
}

function seedMessages(): MessageThread[] {
  const now = new Date().toISOString()
  return messageSeed.map((thread) => ({
    id: thread.id,
    with: thread.with,
    role: thread.role,
    color: thread.color,
    messages: thread.messages.map((message) => ({ id: id("msg"), from: message.from, text: message.text, at: now })),
  }))
}

const initialProfile: DesktopProfile = {
  name: "",
  classLevel: "",
  goal: "",
  onboardingComplete: false,
  completedLessons: [],
  practicePoints: 0,
  coins: 20,
  xp: 0,
  streak: 0,
  homework: [],
  notes: [],
  timetable: [],
  mockResults: [],
  essays: [],
  weakTopics: {},
  challenges: [],
  storeOwned: ["theme-midnight"],
  activeFrame: "",
  activeTheme: "theme-midnight",
  community: [],
  messages: [],
  focusMinutesToday: 0,
}

export function loadProfile(): DesktopProfile {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<DesktopProfile> | null
    const merged: DesktopProfile = {
      ...initialProfile,
      ...saved,
      completedLessons: saved?.completedLessons || [],
      homework: saved?.homework || [],
      notes: saved?.notes && saved.notes.length ? saved.notes : seedNotes(),
      timetable: saved?.timetable && saved.timetable.length ? saved.timetable : seedTimetable(),
      mockResults: saved?.mockResults || [],
      essays: saved?.essays || [],
      weakTopics: saved?.weakTopics || {},
      challenges: saved?.challenges || [],
      storeOwned: saved?.storeOwned && saved.storeOwned.length ? saved.storeOwned : ["theme-midnight"],
      community: saved?.community && saved.community.length ? saved.community : seedCommunity(),
      messages: saved?.messages && saved.messages.length ? saved.messages : seedMessages(),
    }
    return merged
  } catch {
    return { ...initialProfile, notes: seedNotes(), timetable: seedTimetable(), community: seedCommunity(), messages: seedMessages() }
  }
}

export function saveProfile(profile: DesktopProfile) {
  localStorage.setItem(KEY, JSON.stringify(profile))
}

export function resetProfile() {
  localStorage.removeItem(KEY)
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export function nextStreak(profile: DesktopProfile) {
  if (profile.lastStudyDate === todayKey()) return profile.streak
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const y = yesterday.toISOString().slice(0, 10)
  if (profile.lastStudyDate === y) return profile.streak + 1
  return profile.streak === 0 ? 1 : 1
}

export function awardStudy(profile: DesktopProfile, opts: { xp?: number; coins?: number; points?: number } = {}): DesktopProfile {
  return {
    ...profile,
    xp: profile.xp + (opts.xp ?? 0),
    coins: profile.coins + (opts.coins ?? 0),
    practicePoints: profile.practicePoints + (opts.points ?? 0),
    streak: nextStreak(profile),
    lastStudyDate: todayKey(),
  }
}

export function recordWeakTopic(profile: DesktopProfile, subject: Subject, topic: string): DesktopProfile {
  const key = `${subject}::${topic}`
  const existing = profile.weakTopics[key]
  return {
    ...profile,
    weakTopics: {
      ...profile.weakTopics,
      [key]: { subject, misses: (existing?.misses ?? 0) + 1, last: new Date().toISOString() },
    },
  }
}

export function easeWeakTopic(profile: DesktopProfile, subject: Subject, topic: string): DesktopProfile {
  const key = `${subject}::${topic}`
  const existing = profile.weakTopics[key]
  if (!existing || existing.misses <= 0) return profile
  return {
    ...profile,
    weakTopics: {
      ...profile.weakTopics,
      [key]: { ...existing, misses: existing.misses - 1, last: new Date().toISOString() },
    },
  }
}

export function level(xp: number) {
  return Math.max(1, Math.floor(xp / 100) + 1)
}

export function xpIntoLevel(xp: number) {
  return xp % 100
}

export function challengeById(id: string) {
  return challenges.find((challenge) => challenge.id === id)
}

export function newId(prefix: string) {
  return id(prefix)
}

export function focusToday(profile: DesktopProfile) {
  return profile.focusDate === todayKey() ? profile.focusMinutesToday : 0
}
