"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { db, doc, getDoc } from "@/lib/db"
import {
  Award,
  BookOpen,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Timer,
  Trophy,
  X,
  XCircle,
} from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { CalculatorPanel } from "@/components/calculator/calculator-panel"
import { SUBJECTS } from "@/lib/constants"
import {
  correctLetterOf,
  optionsOf,
  questionText,
  type OptionLetter,
  type QuestionOption,
  type StoredQuestion,
} from "@/lib/questions"
import { isProUser } from "@/lib/plan-access"
import type { BankAvailability, MockMode, MockResult } from "@/lib/mock-exams"
import { richText } from "@/lib/rich-text"
import { cn } from "@/lib/utils"

/** Bank availability is checked per board; start and submit are server-owned.
 * The browser keeps unsent answers in memory and retries the same attempt ID.
 * The timer uses a wall-clock deadline; saved results are immutable snapshots.
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
  const [subscription, setSubscription] = useState<{ isPro: boolean } | null>(null)

  const [state, setState] = useState<ExamState>("config")
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [examType, setExamType] = useState("JAMB")
  const [showCalculator, setShowCalculator] = useState(false)

  const [questions, setQuestions] = useState<StoredQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, OptionLetter>>({})
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [fetching, setFetching] = useState(false)
  const [score, setScore] = useState(0)

  const [banner, setBanner] = useState<Banner | null>(null)
  const [availability, setAvailability] = useState<BankAvailability[] | null>(null)
  const [availabilityError, setAvailabilityError] = useState(false)
  const [availabilityVersion, setAvailabilityVersion] = useState(0)
  const [draftAvailable, setDraftAvailable] = useState(false)
  const [mode, setMode] = useState<MockMode>("full")
  const [label, setLabel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmAction, setConfirmAction] = useState<"submit" | "exit" | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const deadlineRef = useRef(0)
  const startRequestRef = useRef<{ key: string; id: string } | null>(null)
  const request = async (body: unknown) => {
    const token = await auth.currentUser?.getIdToken()
    const response = await fetch("/api/mock-exams", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "The exam could not be saved. Please retry.")
    return result
  }
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
        const snap = await getDoc(doc(db, "users", user.uid))
        if (snap.exists()) setSubscription({ isPro: isProUser(snap.data()) })
      } catch (error) {
        console.error("Failed to load your data:", error)
        setBanner({ tone: "error", text: "We could not load your account. Reload the page." })
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    if (!uid) return
    const controller = new AbortController()
    setAvailability(null)
    setAvailabilityError(false)
    setSelectedSubjects([])
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        const response = await fetch(`/api/mock-exams?exam=${examType}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        })
        const result = await response.json()
        if (!response.ok) throw new Error("Availability unavailable")
        if (!controller.signal.aborted) {
          setAvailability(result.subjects)
          setDraftAvailable(result.draftReviewAvailable)
        }
      } catch {
        if (!controller.signal.aborted) setAvailabilityError(true)
      }
    })()
    return () => controller.abort()
  }, [uid, examType, availabilityVersion])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [state])

  useEffect(() => {
    if (confirmAction) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [confirmAction])

  // Wall-clock deadline survives background-tab throttling; no drifting decrement counter.
  useEffect(() => {
    if (state !== "active") return
    const timer = setInterval(
      () => setTimeRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))),
      250,
    )
    return () => clearInterval(timer)
  }, [state])
  useEffect(() => {
    if (state === "active" && timeRemaining === 0) submitRef.current(true)
  }, [state, timeRemaining])

  useEffect(() => {
    if (state !== "active" || mode !== "full" || !resultIdRef.current) return
    const timer = setTimeout(() => {
      void request({ action: "checkpoint", attemptId: resultIdRef.current, answers }).catch(() => {
        setBanner({
          tone: "error",
          text: "Answers have not been backed up. Keep this screen open and restore your connection before the deadline. Late recovery uses only answers already received by the server.",
        })
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [answers, state, mode])

  const toggleSubject = (subject: string) => {
    setSelectedSubjects((prev) => {
      if (prev.includes(subject)) return prev.filter((s) => s !== subject)
      if (prev.length >= (mode === "full" ? SUBJECT_CAP : 1)) {
        setBanner({
          tone: "error",
          text:
            mode === "full"
              ? `You can pick up to ${SUBJECT_CAP} subjects per exam.`
              : "Choose one subject for short revision.",
        })
        return prev
      }
      return [...prev, subject]
    })
  }

  const start = async (draft = false) => {
    if (!uid || (!draft && selectedSubjects.length === 0)) return
    setFetching(true)
    setBanner(null)
    try {
      const key = JSON.stringify([draft, examType, selectedSubjects, mode])
      if (startRequestRef.current?.key !== key) startRequestRef.current = { key, id: crypto.randomUUID() }
      const result = await request({
        action: "start",
        requestId: startRequestRef.current.id,
        exam: draft ? "WAEC" : examType,
        subjects: draft ? ["Mathematics"] : selectedSubjects,
        mode: draft ? "draft_review" : mode,
      })
      startRequestRef.current = null
      setQuestions(result.questions)
      setMode(result.mode)
      setLabel(result.label)
      submittedRef.current = false
      resultIdRef.current = result.id
      deadlineRef.current = Date.parse(result.startedAt) + result.durationSeconds * 1000
      setAnswers({})
      setIndex(0)
      setTimeRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)))
      setState("active")
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "The exam did not load. Retry.",
      })
    } finally {
      setFetching(false)
    }
  }

  const select = (letter: OptionLetter) => {
    const qid = questions[index]?.id
    if (!qid) return
    setAnswers((prev) => ({ ...prev, [qid]: letter }))
  }

  const submit = async (confirmed = false) => {
    if (state !== "active" || submittedRef.current) return
    if (!confirmed) {
      setConfirmAction("submit")
      return
    }
    submittedRef.current = true
    setConfirmAction(null)
    setSaving(true)
    setBanner(null)
    try {
      const { result } = (await request({ action: "submit", attemptId: resultIdRef.current, answers })) as {
        result: MockResult
      }
      setScore(result.score)
      setQuestions(result.questions)
      if (result.timing && result.timing !== "on_time" && mode === "full")
        setLabel(
          "The server deadline passed. This saved score uses only answers backed up before the deadline; later answer changes were not graded.",
        )
      setAnswers(result.answers)
      setShowCalculator(false)
      setState("results")
    } catch (error) {
      submittedRef.current = false
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Your result was not saved. Retry submission.",
      })
    } finally {
      setSaving(false)
    }
  }

  submitRef.current = submit

  const reset = () => {
    setShowCalculator(false)
    setConfirmAction(null)
    setMode("full")
    setLabel(null)
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
        {banner && (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-body-sm text-danger"
          >
            {banner.text}
          </p>
        )}

        <p role="status" className="mb-4 text-body-sm text-muted">
          Saved to your history. Formative revision scores are not institutional assessment evidence.{" "}
          {mode === "draft_review"
            ? "Draft review is excluded from learner progress totals and rewards."
            : "Your progress has been updated."}
        </p>
        {label && <p className="mb-4 rounded-lg border border-warn p-3 text-body-sm">{label}</p>}
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
            <Link href="/app/progress" className="btn-primary">
              View progress and history
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
              const userAnswer = q.id ? (answers[q.id] ?? null) : null
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
                            <span className="text-body-sm font-medium text-foreground">
                              {richText(option.text)}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>

                  {q.explanation ? (
                    <div className="mt-4 rounded-lg border border-accent/30 bg-accent/[0.04] p-4 text-body-sm text-muted">
                      <strong className="font-semibold text-foreground">Worked explanation:</strong>{" "}
                      {richText(q.explanation)}
                    </div>
                  ) : (
                    <p className="mt-4 text-body-sm text-muted">
                      A worked explanation is not available for this imported question. No AI answer has been
                      substituted.
                    </p>
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
    const selected = question.id ? (answers[question.id] ?? null) : null
    const progress = Math.round(((index + 1) / questions.length) * 100)

    return (
      <div className="animate-fade-in pb-32">
        <header className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmAction("exit")}
            disabled={saving}
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

          <button
            type="button"
            onClick={() => setShowCalculator(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-accent"
            aria-label="Open practice calculator"
            title="Open practice calculator"
          >
            <Calculator size={18} aria-hidden="true" />
          </button>
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

        {showCalculator && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowCalculator(false)
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Practice calculator"
              className="w-full max-w-sm max-h-[90vh] overflow-y-auto"
            >
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowCalculator(false)}
                  className="rounded-full bg-surface p-2 text-foreground"
                  aria-label="Close calculator"
                >
                  <X size={18} />
                </button>
              </div>
              <CalculatorPanel mode={examType === "JAMB" ? "basic" : "scientific"} />
            </div>
          </div>
        )}
        <dialog
          ref={dialogRef}
          onCancel={() => setConfirmAction(null)}
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-hairline bg-surface p-6 text-foreground backdrop:bg-black/50"
          aria-labelledby="mock-confirm-title"
        >
          <h2 id="mock-confirm-title" className="text-h3 font-semibold">
            {confirmAction === "exit" ? "Leave this exam?" : "Submit exam?"}
          </h2>
          <p className="mt-3 text-body-sm text-muted">
            {confirmAction === "exit"
              ? "Your unsent answers will be lost."
              : `${Object.keys(answers).length} of ${questions.length} answered. Unanswered questions score zero. You cannot change answers after submission.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button autoFocus type="button" className="btn-secondary" onClick={() => setConfirmAction(null)}>
              Keep working
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => (confirmAction === "exit" ? reset() : void submit(true))}
            >
              {confirmAction === "exit" ? "Leave exam" : "Confirm submission"}
            </button>
          </div>
        </dialog>
        <div className="mx-auto max-w-5xl">
          {label && <p className="mb-4 rounded-lg border border-warn p-3 text-body-sm">{label}</p>}
          {banner && (
            <p role="alert" className="mb-4 text-body-sm text-danger">
              {banner.text}
            </p>
          )}
          <p className="mb-3 text-caption text-muted">
            Content source: {question.source || "Imported bank; source not recorded."}
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-1.5 text-caption font-semibold text-accent">
              <BookOpen size={14} aria-hidden="true" />
              {question.subject}
            </span>
            <span className="text-body-sm font-medium text-muted">
              Question {index + 1} of {questions.length} · {question.exam} ·{" "}
              {mode === "draft_review" ? "Original practice, 2026" : question.year || "Year not recorded"}
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
                    disabled={saving || timeRemaining === 0}
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
                    <span className="text-body-sm font-medium text-foreground">{richText(option.text)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Navigator sidebar */}
        <aside className="card mx-auto mt-6 max-w-5xl p-4">
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
            onClick={() => void submit()}
            disabled={saving}
            className="btn-primary mt-4 w-full"
          >
            {saving ? "Saving result…" : banner ? "Retry submission" : "Submit exam"}
          </button>
        </aside>

        {/* Footer navigation */}
        <div className="mx-auto mt-6 max-w-5xl">
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
        title="Timed mocks and short revision"
        subtitle="Formative practice, not a trusted assessment or official exam paper. Full mocks enforce server deadlines; late recovery uses answers backed up before the deadline. Short revision remains flexible."
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

      {availabilityError && (
        <p role="alert" className="mb-5 text-danger">
          Question availability could not be checked.{" "}
          <button type="button" className="link-inline" onClick={() => setAvailabilityVersion((v) => v + 1)}>
            Retry availability
          </button>
        </p>
      )}
      {!availabilityError && availability === null && (
        <p role="status" className="mb-5">
          Checking {examType} question availability…
        </p>
      )}
      {availability?.length === 0 && (
        <p role="status" className="mb-5">
          No usable {examType} questions are available. Choose another board or return later. No mock
          allowance has been used.
        </p>
      )}
      {draftAvailable && (
        <section className="card mb-6 p-4">
          <h2 className="font-semibold">Teacher review: original SS3 Mathematics draft</h2>
          <p className="mt-2 text-body-sm text-muted">
            8 original WAEC-style questions, 8 minutes. Pending teacher approval; not official past questions.
            This private review does not use weekly mock allowances, AI quotas or learner rewards.
          </p>
          <button
            type="button"
            disabled={fetching}
            onClick={() => void start(true)}
            className="btn-secondary mt-3"
          >
            Review draft Mathematics
          </button>
        </section>
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
                You are limited to one full mock per week. Short revision uses no weekly mock allowance.{" "}
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
        <div className="mb-5 sm:max-w-xs">
          <label htmlFor="mock-mode" className="field-label">
            Activity length
          </label>
          <select
            id="mock-mode"
            className="select-premium"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as MockMode)
              setSelectedSubjects([])
            }}
          >
            <option value="full">Full mock: up to 40 per subject</option>
            <option value="revision">Short revision: up to 8 questions</option>
          </select>
        </div>
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
            Questions may come from multiple years. The board, source and year remain attached to each item.
          </p>
        </div>

        <div className="mt-6 border-t border-hairline pt-6">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <label className="field-label">
              Select subjects{" "}
              <span className="text-accent">
                ({selectedSubjects.length}/{mode === "full" ? SUBJECT_CAP : 1})
              </span>
            </label>
            {selectedSubjects.length === 0 && (
              <span className="text-caption font-semibold text-danger">Pick at least one</span>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {SUBJECTS.map((subject) => {
              const chosen = selectedSubjects.includes(subject)
              const available = availability?.find((item) => item.subject === subject)
              return (
                <li key={subject}>
                  <button
                    type="button"
                    onClick={() => toggleSubject(subject)}
                    disabled={!available?.count}
                    aria-pressed={chosen}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left text-body-sm font-medium transition-colors",
                      chosen
                        ? "border-accent/40 bg-accent/[0.06] text-accent"
                        : "border-hairline text-muted hover:bg-surface-hover hover:text-foreground",
                    )}
                  >
                    <span className="min-w-0 break-words">
                      {subject}
                      <span className="mt-1 block text-caption">
                        {available
                          ? `${available.count} available · ${available.withExplanations} with explanations`
                          : availability
                            ? "Unavailable"
                            : "Checking…"}
                      </span>
                    </span>
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
            {selectedSubjects.reduce(
              (total, subject) =>
                total +
                Math.min(
                  mode === "full" ? 40 : 8,
                  availability?.find((item) => item.subject === subject)?.count ?? 0,
                ),
              0,
            )}{" "}
            questions and the same number of minutes (one minute per question).
          </p>
        )}

        <button
          type="button"
          onClick={() => void start()}
          disabled={selectedSubjects.length === 0 || fetching || availability === null || availabilityError}
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
