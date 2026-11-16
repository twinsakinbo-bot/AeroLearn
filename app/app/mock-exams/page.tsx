"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { arrayUnion, collection, db, doc, getDoc, getDocs, increment, limit, query, serverTimestamp, setDoc, updateDoc, where } from "@/lib/db"
import { Award, BookOpen, Check, ChevronLeft, ChevronRight, Loader2, Lock, Timer, Trophy, X, XCircle } from "lucide-react"
import Link from "next/link"

import { LibraryPendingNotice } from "@/components/ui/availability"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { SUBJECTS } from "@/lib/constants"
import {
  correctLetterOf,
  optionsOf,
  questionText,
  shuffled,
  type OptionLetter,
  type QuestionOption,
  type StoredQuestion,
} from "@/lib/questions"
import { getUserSubscription, type UserSubscriptionInfo } from "@/lib/subscription"
import { richText } from "@/lib/rich-text"
import { cn } from "@/lib/utils"

/**
 * Full timed mock exams.
 *
 * The old configuration UI had backdrop-blur 2.5rem/3rem cards, framer-motion
 * stagger, gradient buttons with shadow-accent/30, and forced Inter-900 ("font-black").
 * The exam view was a two-column split (question on left, navigator sidebar on
 * right) with another backdrop-blur card; the results page had a spinning green
 * circle, shadow-[0_0_30px_rgba(...)], and framer-motion stagger over answers.
 * All of that is now static PageHeader, card primitive, and standard buttons.
 *
 * Three substantive bugs fixed:
 *
 * 1. **Shuffle was weak** — `sort(() => 0.5 - Math.random())` is biased (adjacent
 *    swaps dominate, so some permutations never occur). Now uses `shuffled()` from
 *    `lib/questions.ts`, which is Fisher–Yates.
 * 2. **Timer closure read stale state** — the `setInterval` callback inside
 *    `useEffect(..., [examState, timeRemaining])` closed over the initial
 *    `handleSubmitExam`, which itself closed over the original `questions` and
 *    `answers`. If the user navigated forward/back or selected answers after the
 *    interval started, the submit fired with the old snapshot. Now `handleSubmitExam`
 *    is wrapped in a ref so the timer always calls the latest version.
 * 3. **Question-shape mismatch** — the page assumed `options` was a map `{A,B,C,D}`,
 *    but practice questions in Firestore can be either that or `[{id,text}]` (the
 *    route `/api/ai-quiz` returns arrays). Now uses `optionsOf()` and
 *    `correctLetterOf()` from `lib/questions.ts`, which normalize both.
 * 4. **Markup rendered as text** — imported past questions are HTML fragments, so
 *    `451<sub>6</sub> - P<sub>7</sub>` reached the screen with its tags showing and
 *    the two numbers looking like the same base. Question text, options and
 *    explanations go through `richText()` now.
 *
 * Minor: `alert()` for subject cap and early-submit confirmation replaced with banner
 * and confirm dialog. The Year select was removed — it was picked, stored, and never
 * read, because the query has no year column, so it promised a 2024 paper and gave
 * whatever was in the bank.
 */

const EXAM_TYPES = ["JAMB", "WAEC", "NECO"] as const
const SUBJECT_CAP = 4

type ExamState = "config" | "active" | "results"
type Banner = { tone: "success" | "error"; text: string }

function optionTone(
  option: QuestionOption,
  selected: OptionLetter | null,
  correct: OptionLetter | null,
  showCorrect: boolean,
): "idle" | "selected" | "correct" | "wrong" {
  if (!showCorrect) return option.letter === selected ? "selected" : "idle"
  if (option.letter === correct) return "correct"
  if (option.letter === selected) return "wrong"
  return "idle"
}

const OPTION_CLASSES = {
  idle: "border-hairline bg-surface-sunken hover:bg-surface-hover",
  selected: "border-accent bg-accent/[0.06] ring-1 ring-accent",
  correct: "border-success bg-success/[0.06]",
  wrong: "border-danger bg-danger/[0.06]",
}

const LETTER_CLASSES = {
  idle: "bg-surface-sunken text-muted",
  selected: "bg-accent text-white dark:text-ink-950",
  correct: "bg-success text-white",
  wrong: "bg-danger text-white",
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

export default function MockExamsPage() {
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<UserSubscriptionInfo | null>(null)
  const [userProfile, setUserProfile] = useState<any>(null)

  const [state, setState] = useState<ExamState>("config")
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [examType, setExamType] = useState("JAMB")

  const [questions, setQuestions] = useState<StoredQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, OptionLetter>>({})
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [fetching, setFetching] = useState(false)
  const [score, setScore] = useState(0)

  const [banner, setBanner] = useState<Banner | null>(null)
  /**
   * Whether the question bank has anything in it at all.
   *
   * A mock exam is drawn from `practiceQuestions`, which is empty until an admin
   * imports. Without this the student picks four subjects, waits on the fetch,
   * and gets an error that reads as their mistake. One `limit(1)` probe on mount
   * lets the page say so up front — and it stops saying so on its own the moment
   * the bank has rows, which a hardcoded notice would not.
   */
  const [bankEmpty, setBankEmpty] = useState<boolean | null>(null)
  const submitRef = useRef<(timeExpired?: boolean) => void>(() => {})
  const submittedRef = useRef(false)
  const resultIdRef = useRef("")

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        return
      }
      setUid(user.uid)
      try {
        const sub = await getUserSubscription(user.uid)
        setSubscription(sub)
        const snap = await getDoc(doc(db, "users", user.uid))
        if (snap.exists()) setUserProfile(snap.data())

        /* One row is all we need to know whether a mock is possible at all. */
        const probe = await getDocs(query(collection(db, "practiceQuestions"), limit(1)))
        setBankEmpty(probe.empty)
      } catch (error) {
        console.error("Failed to load your data:", error)
        setBanner({ tone: "error", text: "We could not load your account. Reload the page." })
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [router])

  /* Timer always calls the latest submit function. */
  useEffect(() => {
    if (state !== "active" || timeRemaining === 0) return
    const timer = setInterval(() => {
      setTimeRemaining((s) => {
        if (s <= 1) {
          submitRef.current(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [state, timeRemaining])

  const toggleSubject = (subject: string) => {
    setSelectedSubjects((prev) => {
      if (prev.includes(subject)) return prev.filter((s) => s !== subject)
      if (prev.length >= SUBJECT_CAP) {
        setBanner({
          tone: "error",
          text: `You can pick up to ${SUBJECT_CAP} subjects per exam.`,
        })
        return prev
      }
      return [...prev, subject]
    })
  }

  const start = async () => {
    if (!uid || selectedSubjects.length === 0) return

    if (!subscription?.isPro) {
      const today = new Date()
      const lastExam = userProfile?.lastMockExamDate ? new Date(userProfile.lastMockExamDate) : null
      if (lastExam) {
        const diffDays = Math.ceil(Math.abs(today.getTime() - lastExam.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays < 7) {
          setBanner({
            tone: "error",
            text: `Free users are limited to one mock per week. You have ${7 - diffDays} day${7 - diffDays === 1 ? "" : "s"} left.`,
          })
          return
        }
      }
    }

    setFetching(true)
    setBanner(null)
    let pool: StoredQuestion[] = []

    try {
      for (const subject of selectedSubjects) {
        const q = query(
          collection(db, "practiceQuestions"),
          where("subject", "==", subject),
          where("exam", "==", examType),
        )
        const snapshot = await getDocs(q)
        const subjectQuestions = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as StoredQuestion))
          .filter((q) => optionsOf(q).length >= 2 && correctLetterOf(q))

        pool.push(...shuffled(subjectQuestions).slice(0, 40))
      }

      if (pool.length === 0) {
        /* Not the student's fault, and not a configuration they got wrong — the
           library simply has nothing under those subjects yet. Say that, and
           point at the thing that does work. */
        setBanner({
          tone: "error",
          text: `No ${examType} questions have been imported for ${
            selectedSubjects.length === 1 ? selectedSubjects[0] : "those subjects"
          } yet. Try other subjects, or use AI practice, which covers the same syllabus.`,
        })
        setFetching(false)
        return
      }

      setQuestions(pool)
      submittedRef.current = false
      resultIdRef.current = crypto.randomUUID()
      setAnswers({})
      setIndex(0)
      setTimeRemaining(pool.length * 60)
      setState("active")

      if (!subscription?.isPro) {
        await updateDoc(doc(db, "users", uid), {
          lastMockExamDate: new Date().toISOString(),
        })
      }
    } catch (error) {
      console.error("Failed to load questions:", error)
      setBanner({ tone: "error", text: "The exam did not load. Try again." })
    } finally {
      setFetching(false)
    }
  }

  const select = (letter: OptionLetter) => {
    const qid = questions[index]?.id
    if (!qid) return
    setAnswers((prev) => ({ ...prev, [qid]: letter }))
  }

  const submit = (timeExpired = false) => {
    if (state !== "active" || submittedRef.current) return
    if (!timeExpired && timeRemaining > 0) {
      const confirmed = confirm("Submit early? You cannot undo this.")
      if (!confirmed) return
    }
    submittedRef.current = true

    let totalScore = 0
    questions.forEach((q) => {
      const correct = correctLetterOf(q)
      if (correct && q.id && answers[q.id] === correct) totalScore += 1
    })
    setScore(totalScore)
    setState("results")

    if (uid) {
      updateDoc(doc(db, "users", uid), {
        xp: increment(totalScore * 5),
        coins: increment(totalScore * 2),
        subjectsStudied: arrayUnion(...selectedSubjects),
      }).catch((error) => {
        console.error("Could not save mock exam rewards:", error)
        setBanner({ tone: "error", text: "Your exam rewards could not be saved. Please check your connection." })
      })
      setDoc(doc(db, "quizResults", resultIdRef.current), {
        userId: uid,
        source: "mock_exam",
        exam: examType,
        score: totalScore,
        totalQuestions: questions.length,
        createdAt: serverTimestamp(),
      }).catch((error) => {
        console.error("Could not save mock exam result:", error)
        setBanner({ tone: "error", text: "Your mock exam score could not be saved to Progress. Please check your connection." })
      })
    }
  }

  submitRef.current = submit

  const reset = () => {
    submittedRef.current = false
    resultIdRef.current = ""
    setState("config")
    setSelectedSubjects([])
    setQuestions([])
    setAnswers({})
    setIndex(0)
    setScore(0)
    setBanner(null)
  }

  if (loading) return <LoadingState full text="Loading mock exams…" />

  if (state === "results") {
    const percent = Math.round((score / Math.max(questions.length, 1)) * 100)
    return (
      <div className="animate-fade-in">
        <PageHeader eyebrow="Mock exam" title="Results" onBack={reset} backLabel="Back to setup" />
        {banner && <p role="alert" className="mb-5 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-body-sm text-danger">{banner.text}</p>}

        <div className="card p-6 sm:p-8 text-center">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-streak/[0.12] text-streak">
            <Trophy size={32} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-h2 font-semibold text-foreground">
            {score} of {questions.length} correct
          </h2>
          <p className="mt-2 text-body text-muted">That is {percent}%.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={reset} className="btn-secondary">
              Take another mock
            </button>
            <Link href="/app" className="btn-primary">
              Back to dashboard
            </Link>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="mb-4 flex items-center gap-2 text-h3 font-semibold text-foreground">
            <Award size={20} className="text-accent" aria-hidden="true" />
            Review your answers
          </h2>
          <ul className="space-y-6">
            {questions.map((q, idx) => {
              const options = optionsOf(q)
              const correct = correctLetterOf(q)
              const userAnswer = q.id ? answers[q.id] ?? null : null
              const isCorrect = correct && userAnswer === correct
              return (
                <li
                  key={q.id}
                  className={cn(
                    "card p-4 sm:p-5",
                    isCorrect ? "border-success/30 bg-success/[0.04]" : "border-danger/30 bg-danger/[0.04]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-caption font-semibold",
                        isCorrect ? "bg-success/[0.12] text-success" : "bg-danger/[0.12] text-danger",
                      )}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-body font-semibold leading-relaxed text-foreground">
                        {richText(questionText(q))}
                      </h3>
                    </div>
                    {isCorrect ? (
                      <Check size={20} className="shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <X size={20} className="shrink-0 text-danger" aria-hidden="true" />
                    )}
                  </div>

                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {options.map((option) => {
                      const tone = optionTone(option, userAnswer, correct, true)
                      return (
                        <li key={option.letter}>
                          <div
                            className={cn(
                              "flex items-center gap-3 rounded-lg border p-3",
                              OPTION_CLASSES[tone],
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold",
                                LETTER_CLASSES[tone],
                              )}
                            >
                              {option.letter}
                            </span>
                            <span className="text-body-sm font-medium text-foreground">{richText(option.text)}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>

                  {!isCorrect && q.explanation && (
                    <div className="mt-4 rounded-lg border border-accent/30 bg-accent/[0.04] p-4 text-body-sm text-muted">
                      <strong className="font-semibold text-foreground">Why:</strong>{" "}
                      {richText(q.explanation)}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    )
  }

  if (state === "active") {
    const question = questions[index]
    if (!question) return null
    const options = optionsOf(question)
    const selected = question.id ? answers[question.id] ?? null : null
    const progress = Math.round(((index + 1) / questions.length) * 100)

    return (
      <div className="animate-fade-in pb-32">
        <header className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const confirmed = confirm("Exit the exam? Your progress will be lost.")
              if (confirmed) reset()
            }}
            aria-label="Exit the exam"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X size={18} aria-hidden="true" />
          </button>

          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <span
            className={cn(
              "shrink-0 rounded-lg border px-3 py-1.5 text-caption font-semibold tabular-nums",
              timeRemaining < 300
                ? "border-danger/30 bg-danger/[0.06] text-danger"
                : "border-hairline bg-surface text-muted",
            )}
            role="timer"
            aria-live="off"
          >
            {formatTime(timeRemaining)}
          </span>
        </header>

        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-1.5 text-caption font-semibold text-accent">
              <BookOpen size={14} aria-hidden="true" />
              {question.subject}
            </span>
            <span className="text-body-sm font-medium text-muted">
              Question {index + 1} of {questions.length}
            </span>
          </div>

          <h1 className="mb-8 text-center text-h2 font-semibold leading-snug text-foreground">
            {richText(questionText(question))}
          </h1>

          <ul className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => {
              const tone = optionTone(option, selected, null, false)
              return (
                <li key={option.letter}>
                  <button
                    type="button"
                    onClick={() => select(option.letter)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors",
                      OPTION_CLASSES[tone],
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold",
                        LETTER_CLASSES[tone],
                      )}
                    >
                      {option.letter}
                    </span>
                    <span className="text-body-sm font-medium text-foreground">
                      {richText(option.text)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Navigator sidebar */}
        <aside className="card p-4 fixed bottom-20 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] sm:bottom-6 md:right-8">
          <h2 className="mb-3 text-caption font-semibold uppercase tracking-wide text-muted">
            Question navigator
          </h2>
          <div className="grid max-h-48 grid-cols-8 gap-2 overflow-y-auto">
            {questions.map((q, idx) => {
              const answered = q.id ? !!answers[q.id] : false
              const active = idx === index
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setIndex(idx)}
                  className={cn(
                    "flex h-10 items-center justify-center rounded-lg border text-caption font-semibold transition-colors",
                    active
                      ? "border-accent bg-accent text-white dark:text-ink-950"
                      : answered
                        ? "border-accent/40 bg-accent/[0.06] text-accent"
                        : "border-hairline bg-surface-sunken text-muted hover:bg-surface-hover",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {idx + 1}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => submit()}
            className="btn-primary mt-4 w-full"
          >
            Submit exam
          </button>
        </aside>

        {/* Footer navigation */}
        <div className="fixed bottom-20 left-0 right-0 z-40 bg-gradient-to-t from-surface via-surface to-transparent p-4 sm:bottom-6 md:pl-64">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="btn-secondary"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
              disabled={index === questions.length - 1}
              className="btn-primary"
            >
              Next
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Mock exams"
        title="Full timed simulations"
        subtitle="Practice under real exam conditions with WAEC, NECO, and JAMB questions."
      />

      {banner && (
        <p
          role={banner.tone === "error" ? "alert" : "status"}
          className={cn(
            "mb-6 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-body-sm",
            banner.tone === "error"
              ? "border-danger/30 bg-danger/[0.06] text-danger"
              : "border-success/30 bg-success/[0.06] text-success",
          )}
        >
          {banner.text}
        </p>
      )}

      {bankEmpty && (
        <LibraryPendingNotice
          className="mb-6"
          title="No papers to sit yet"
          detail="No past questions have been imported into the library yet, so there is nothing to assemble a timed paper from. AI-generated practice covers the same syllabus in the meantime."
        />
      )}

      {!subscription?.isPro && (
        <div className="card p-4 mb-6 border-accent/30 bg-accent/[0.04]">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/[0.12] text-accent">
              <Lock size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-body font-semibold text-foreground">Free tier limit</h2>
              <p className="mt-1 text-body-sm text-muted">
                You are limited to one mock per week.{" "}
                <Link href="/app/upgrade" className="font-semibold text-accent hover:underline">
                  Upgrade to Pro
                </Link>{" "}
                for unlimited daily mocks and advanced analytics.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card p-5 sm:p-6">
        <div className="sm:max-w-xs">
          <label htmlFor="examType" className="field-label">
            Exam type
          </label>
          <select
            id="examType"
            value={examType}
            onChange={(e) => setExamType(e.target.value)}
            className="select-premium"
          >
            {EXAM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <p className="mt-2 text-caption text-subtle">
            Your paper is drawn from every year in the library for this board.
          </p>
        </div>

        <div className="mt-6 border-t border-hairline pt-6">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <label className="field-label">
              Select subjects <span className="text-accent">({selectedSubjects.length}/{SUBJECT_CAP})</span>
            </label>
            {selectedSubjects.length === 0 && (
              <span className="text-caption font-semibold text-danger">Pick at least one</span>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {SUBJECTS.map((subject) => {
              const chosen = selectedSubjects.includes(subject)
              return (
                <li key={subject}>
                  <button
                    type="button"
                    onClick={() => toggleSubject(subject)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left text-body-sm font-medium transition-colors",
                      chosen
                        ? "border-accent/40 bg-accent/[0.06] text-accent"
                        : "border-hairline text-muted hover:bg-surface-hover hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{subject}</span>
                    {chosen && <Check size={14} className="shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {selectedSubjects.length > 0 && (
          <p className="mt-6 border-t border-hairline pt-6 text-body-sm text-muted">
            <strong className="font-semibold text-foreground">Exam duration:</strong>{" "}
            {selectedSubjects.length * 40} questions, roughly {selectedSubjects.length} hour
            {selectedSubjects.length === 1 ? "" : "s"}.
          </p>
        )}

        <button
          type="button"
          onClick={start}
          disabled={selectedSubjects.length === 0 || fetching || bankEmpty === true}
          className="btn-primary mt-6 w-full sm:w-auto"
        >
          {fetching && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          <Timer size={16} aria-hidden="true" />
          {fetching ? "Preparing…" : "Start exam"}
        </button>
      </div>
    </div>
  )
}

