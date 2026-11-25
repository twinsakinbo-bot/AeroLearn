"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { arrayUnion, db, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from "@/lib/db"
import { Check, ChevronRight, Loader2, Trophy, X, Zap } from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { SUBJECTS, type Subject } from "@/lib/constants"
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
 * AI-generated practice quiz.
 *
 * This called `/api/ai-quiz` and `/api/ai-tutor` with no credentials, and both
 * routes accepted anyone; they are gated now, so the fetch carries the signed-in
 * student's ID token. It also sent `classLevel: difficulty`, so the prompt read
 * "Class Level: Easy" and the syllabus was anchored to a level that does not
 * exist — the student's real class now goes with it, separately. The usage cap was
 * written to
 * `practiceQuestionsUsedToday` on the first answer but read from a subscription
 * helper that itself reads the same field, so at least the field name was
 * consistent. The confetti on completion used `canvas-confetti` and a class on
 * `document.body` to stop it firing twice; that is gone. The floating action bar
 * sat `bottom-16` to clear the mobile tab bar — the same trick the lesson page
 * and AiChatBox use.
 *
 * Question shape: the route returns options as `[{id, text}]`, which the page
 * mapped into `{A,B,C,D}`. Both the route's response and Firestore rows can now
 * be read with `lib/questions.ts`.
 *
 * The Exam-type select is gone. It asked the student to re-state something they
 * already told us at signup (`users.examType`) and could contradict it — a JSS 2
 * student could ask for JAMB questions, and the prompt would oblige. The target
 * exam now comes from the profile, falling back to the class level, because
 * `/api/ai-quiz` defaults a missing `exam` to "WAEC" and would otherwise anchor a
 * junior-secondary student to a senior-secondary syllabus.
 */

/** The exam a student is working towards, when they have not told us directly. */
function examForClass(classLevel: string) {
  return classLevel.startsWith("JSS") ? "BECE" : "WAEC"
}

const PRACTICE_CAP_FREE = 2
const QUESTION_COUNTS = [5, 10, 15, 20] as const
const DIFFICULTIES = ["Easy", "Medium", "Hard", "Exam standard"] as const

type Quiz = {
  id: string
  subject: Subject
  exam: string
  difficulty: string
  questions: StoredQuestion[]
}

type Banner = { tone: "success" | "error"; text: string }

function optionTone(
  option: QuestionOption,
  selected: OptionLetter | null,
  correct: OptionLetter | null,
  marked: boolean,
) {
  if (!marked) return option.letter === selected ? "selected" : "idle"
  if (option.letter === correct) return "correct"
  if (option.letter === selected) return "wrong"
  return "dimmed"
}

const OPTION_CLASSES = {
  idle: "border-hairline bg-surface-sunken hover:bg-surface-hover",
  selected: "border-accent bg-accent/[0.06] ring-1 ring-accent",
  correct: "border-success bg-success/[0.06] ring-1 ring-success",
  wrong: "border-danger bg-danger/[0.06] ring-1 ring-danger",
  dimmed: "border-hairline bg-surface opacity-40",
}

const LETTER_CLASSES = {
  idle: "bg-surface-sunken text-muted",
  selected: "bg-accent text-white dark:text-ink-950",
  correct: "bg-success text-white",
  wrong: "bg-danger text-white",
  dimmed: "bg-surface-sunken text-subtle",
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export default function PracticePage() {
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState<UserSubscriptionInfo | null>(null)
  /* Sent to the quiz route as the syllabus anchor. Empty is fine — the route
     falls back to a generic senior-secondary prompt. */
  const [classLevel, setClassLevel] = useState("")
  /* The exam the student named at signup. Null when they chose to learn without
     an exam in mind, in which case the class level decides. */
  const [targetExam, setTargetExam] = useState("")

  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [generating, setGenerating] = useState(false)
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState<OptionLetter | null>(null)
  const [marked, setMarked] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [savingResult, setSavingResult] = useState(false)

  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const tickRef = useRef(0)

  const [banner, setBanner] = useState<Banner | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        return
      }
      setUid(user.uid)
      try {
        const [sub, profile] = await Promise.all([
          getUserSubscription(user.uid),
          getDoc(doc(db, "users", user.uid)),
        ])
        setSubscription(sub)
        const stored = profile.exists() ? profile.data()?.classLevel : undefined
        if (typeof stored === "string") setClassLevel(stored)
        const exam = profile.exists() ? profile.data()?.examType : undefined
        if (typeof exam === "string" && exam && exam !== "Other") setTargetExam(exam)
      } catch (error) {
        console.error("Failed to load your subscription:", error)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [running])

  const generate = async (subject: Subject, difficulty: string, count: number) => {
    if (!uid) return
    const exam = targetExam || examForClass(classLevel)
    const used = subscription?.practiceQuestionsUsedToday ?? 0
    if (!subscription?.isPro && used >= PRACTICE_CAP_FREE) {
      setBanner({
        tone: "error",
        text: `You have used both free practices today. Upgrade to Pro for unlimited.`,
      })
      return
    }

    setGenerating(true)
    setBanner(null)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch("/api/ai-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subject, exam, classLevel, difficulty, numQuestions: count }),
      })
      if (!res.ok) {
        /* The route explains itself ("Sign in to continue.", "Pick a subject
           first."); swallowing that left the student with nothing to act on. */
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.error || "The quiz did not generate.")
      }
      const data = await res.json()

      if (!data.questions || data.questions.length === 0) {
        throw new Error("No questions came back.")
      }

      const pool = shuffled(data.questions as StoredQuestion[]).filter(
        (q) => optionsOf(q).length >= 2 && correctLetterOf(q),
      )
      if (pool.length === 0) throw new Error("None of the questions were usable.")

      setQuiz({ id: crypto.randomUUID(), subject, exam, difficulty, questions: pool })
      setIndex(0)
      setAnswer(null)
      setMarked(false)
      setScore(0)
      setDone(false)
      setSavingResult(false)
      setSeconds(0)
      setRunning(true)
      tickRef.current += 1

      await updateDoc(doc(db, "users", uid), {
        practiceQuestionsUsedToday: increment(1),
      })
      if (subscription) {
        setSubscription({ ...subscription, practiceQuestionsUsedToday: used + 1 })
      }
    } catch (error) {
      console.error("Failed to generate the quiz:", error)
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "The quiz did not generate. Try again.",
      })
    } finally {
      setGenerating(false)
    }
  }

  const check = async () => {
    if (!uid || !quiz) return
    const question = quiz.questions[index]
    const correct = correctLetterOf(question)

    if (!marked) {
      setMarked(true)
      setRunning(false)
      const right = correct !== null && answer === correct
      if (right) setScore((s) => s + 1)

      try {
        await updateDoc(doc(db, "users", uid), {
          xp: increment(right ? 10 : 0),
          coins: increment(right ? 5 : 0),
          totalQuestionsAnswered: increment(1),
          ...(right ? { totalQuestionsCorrect: increment(1) } : {}),
          subjectsStudied: arrayUnion(quiz.subject),
        })
      } catch (error) {
        console.error("Failed to record your answer:", error)
      }
    } else {
      const next = index + 1
      if (next >= quiz.questions.length) {
        setRunning(false)
        setSavingResult(true)
        try {
          await setDoc(doc(db, "quizResults", quiz.id), {
            userId: uid,
            subject: quiz.subject,
            source: "practice",
            score,
            totalQuestions: quiz.questions.length,
            createdAt: serverTimestamp(),
          })
        } catch (error) {
          console.error("Could not save quiz result:", error)
          setBanner({ tone: "error", text: "Your quiz score could not be saved to Progress. Check your connection before starting another quiz." })
        } finally {
          setSavingResult(false)
          setDone(true)
        }
      } else {
        setIndex(next)
        setAnswer(null)
        setMarked(false)
        setRunning(true)
      }
    }
  }

  const reset = () => {
    setQuiz(null)
    setIndex(0)
    setAnswer(null)
    setMarked(false)
    setScore(0)
    setDone(false)
    setSavingResult(false)
    setSeconds(0)
    setRunning(false)
    setBanner(null)
  }

  if (loading) return <LoadingState full text="Loading practice…" />

  if (!quiz) {
    return (
      <div className="animate-fade-in">
        <PageHeader
          eyebrow="Practice"
          title="AI-generated quizzes"
          subtitle="Pick a subject and difficulty, and get a timed set of questions drawn from the exam syllabus."
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

        {!subscription?.isPro && (
          <div className="card p-4 mb-6 border-accent/30 bg-accent/[0.04]">
            <p className="text-body-sm text-muted">
              <strong className="font-semibold text-foreground">Free tier:</strong> You have{" "}
              {Math.max(PRACTICE_CAP_FREE - (subscription?.practiceQuestionsUsedToday ?? 0), 0)} of{" "}
              {PRACTICE_CAP_FREE} practices left today.{" "}
              <Link href="/app/upgrade" className="font-semibold text-accent hover:underline">
                Upgrade to Pro
              </Link>{" "}
              for unlimited practice.
            </p>
          </div>
        )}

        <ConfigForm
          onSubmit={generate}
          disabled={generating}
          isPro={subscription?.isPro ?? false}
          exam={targetExam || examForClass(classLevel)}
          classLevel={classLevel}
        />
      </div>
    )
  }

  if (done) {
    return (
      <div className="animate-fade-in">
        <PageHeader
          eyebrow="Practice"
          title="Quiz complete"
          subtitle={`${quiz.subject} · ${quiz.exam} · ${quiz.difficulty}`}
          onBack={reset}
          backLabel="Back to setup"
        />

        {banner && <p role="alert" className="mb-5 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-body-sm text-danger">{banner.text}</p>}

        <div className="card p-6 sm:p-8 text-center">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-streak/[0.12] text-streak">
            <Trophy size={32} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-h2 font-semibold text-foreground">
            {score} of {quiz.questions.length} correct
          </h2>
          <p className="mt-2 text-body text-muted">
            Finished in {formatTime(seconds)}. That is{" "}
            {Math.round((score / Math.max(quiz.questions.length, 1)) * 100)}%.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={reset} className="btn-secondary">
              Start another quiz
            </button>
            <Link href="/app" className="btn-primary">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const question = quiz.questions[index]
  const options = optionsOf(question)
  const correct = correctLetterOf(question)
  const progress = Math.round(((index + 1) / quiz.questions.length) * 100)

  return (
    <div className="animate-fade-in pb-32">
      <header className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          aria-label="Exit the quiz"
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
            seconds < 60 ? "border-hairline bg-surface text-muted" : "border-accent/30 bg-accent/[0.06] text-accent",
          )}
        >
          {formatTime(seconds)}
        </span>
      </header>

      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-center text-h2 font-semibold leading-snug text-foreground">
          {richText(questionText(question))}
        </h1>

        <ul className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const tone = optionTone(option, answer, correct, marked)
            return (
              <li key={option.letter}>
                <button
                  type="button"
                  onClick={() => !marked && setAnswer(option.letter)}
                  disabled={marked}
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

        {marked && question.explanation && (
          <div className="card p-4 mt-6 border-accent/30 bg-accent/[0.04]">
            <p className="text-body-sm text-muted">
              <strong className="font-semibold text-foreground">Why:</strong>{" "}
              {richText(question.explanation)}
            </p>
          </div>
        )}
      </div>

      <div className="fixed bottom-20 left-0 right-0 z-50 bg-gradient-to-t from-surface via-surface to-transparent p-4 sm:bottom-6 md:pl-64">
        <div className="mx-auto flex max-w-3xl justify-end">
          <button
            type="button"
            onClick={check}
            disabled={savingResult || (!answer && !marked)}
            className={cn(
              "btn-primary w-full sm:w-auto",
              marked &&
                (answer === correct
                  ? "border-success bg-success hover:bg-success/90"
                  : "border-danger bg-danger hover:bg-danger/90"),
            )}
          >
            {marked ? (
              <>
                <ChevronRight size={16} aria-hidden="true" />
                {savingResult ? "Saving score…" : index + 1 < quiz.questions.length ? "Next question" : "Finish"}
              </>
            ) : (
              "Check answer"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfigForm({
  onSubmit,
  disabled,
  isPro,
  exam,
  classLevel,
}: {
  onSubmit: (subject: Subject, difficulty: string, count: number) => void
  disabled: boolean
  isPro: boolean
  exam: string
  classLevel: string
}) {
  const [subject, setSubject] = useState<Subject | null>(null)
  const [difficulty, setDifficulty] = useState("Medium")
  const [count, setCount] = useState(5)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (subject) onSubmit(subject, difficulty, count)
      }}
      className="card p-5 sm:p-6"
    >
      <h2 className="text-body font-semibold text-foreground">Configure your quiz</h2>
      <p className="mt-1 text-body-sm text-muted">
        Questions follow the {exam} syllabus{classLevel ? ` at ${classLevel}` : ""}, taken from your
        profile.{" "}
        <Link href="/app/settings" className="font-semibold text-accent hover:underline">
          Change it in settings
        </Link>
        .
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="subject" className="field-label">
            Subject
          </label>
          <select
            id="subject"
            value={subject ?? ""}
            onChange={(event) => setSubject((event.target.value as Subject) || null)}
            className="select-premium"
          >
            <option value="">Pick a subject</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="difficulty" className="field-label">
            Difficulty
          </label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
            className="select-premium"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="count" className="field-label">
            Questions
          </label>
          <select
            id="count"
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="select-premium"
          >
            {QUESTION_COUNTS.map((n) => (
              <option key={n} value={n} disabled={n === 20 && !isPro}>
                {n} questions{n === 20 && !isPro ? " (Pro)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button type="submit" disabled={!subject || disabled} className="btn-primary mt-5 w-full sm:w-auto">
        {disabled && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {disabled ? "Generating…" : "Start quiz"}
      </button>
    </form>
  )
}
