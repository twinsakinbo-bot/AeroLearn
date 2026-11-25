"use client"

import { useEffect, useRef, useState } from "react"
import { auth, onAuthStateChanged } from "@/lib/auth"
import {
  collection,
  db,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "@/lib/db"
import { Check, ChevronRight, Clock, Coins, ListChecks, Timer, Trophy, X } from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { ProgressBar } from "@/components/ui/progress-bar"
import {
  correctLetterOf,
  optionsOf,
  questionText,
  shuffled,
  type OptionLetter,
  type StoredQuestion,
} from "@/lib/questions"
import { richText } from "@/lib/rich-text"
import { cn } from "@/lib/utils"

/**
 * Weekly timed challenges: a set of questions against the clock for Aero coins.
 *
 * Three things here were broken rather than merely ugly. The quiz called
 * `.map()` on `options`, which the question bank stores as an A–D map, and
 * compared `correctAnswer` — a letter — against the option's text, so it either
 * threw or scored zero; both now go through `lib/questions`. The final score
 * added the last answer twice, because it re-checked the selected option on top
 * of a tally that had already counted it. And a challenge could be replayed for
 * coins without limit; results are read on load, so a finished challenge now
 * shows its score instead of a Start button.
 *
 * The leaderboard query ordered by score and then time behind an equality
 * filter, which needs a composite index that does not exist — it is ranked in
 * memory now.
 *
 * Question and option text go through `richText`: past questions are stored as
 * HTML fragments, so "stop <u>browbeating</u> the children" was reaching the
 * screen with the tags showing, and in a synonym question the underline is the
 * only thing marking which word is being asked about.
 */

/** Enough of a pool that the shuffle means something. */
const QUESTION_POOL = 60
const ADVANCE_MS = 800
const URGENT_SECONDS = 30
const STANDINGS_SHOWN = 10

type Challenge = {
  id: string
  subject: string
  title: string
  description: string
  questionCount: number
  timeLimit: number
  prize: number
  endDate?: unknown
}

type Result = { score: number; total: number; timeTaken: number; coins: number }

type Standing = {
  displayName?: string
  score?: number
  totalQuestions?: number
  timeTaken?: number
}

type Taken = Record<string, { score: number; total: number }>

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`
}

/** `endDate` arrives as a Firestore Timestamp, a Date, or a string. */
function asDate(value: unknown): Date | null {
  if (!value) return null
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate()
  }
  const parsed = new Date(value as string | number | Date)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function daysLeft(challenge: Challenge) {
  const end = asDate(challenge.endDate)
  if (!end) return null
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000))
}

/** Idle, chosen, right and wrong — the four states an option can be in. */
function optionTone(selected: boolean, marked: boolean, correct: boolean) {
  if (marked && correct) return "border-success/40 bg-success/10 text-success"
  if (marked && selected) return "border-danger/40 bg-danger/10 text-danger"
  if (marked) return "border-hairline bg-surface text-muted"
  if (selected) return "border-accent bg-accent/10 text-accent"
  return "border-hairline bg-surface text-muted hover:bg-surface-hover hover:text-foreground"
}

function letterTone(selected: boolean, marked: boolean, correct: boolean) {
  if (marked && correct) return "bg-success text-white dark:text-ink-950"
  if (marked && selected) return "bg-danger text-white"
  if (selected) return "bg-accent text-white dark:text-ink-950"
  return "bg-surface-sunken text-subtle"
}

async function fetchChallenges(): Promise<Challenge[]> {
  const snap = await getDocs(
    query(
      collection(db, "challenges"),
      where("endDate", ">", new Date()),
      orderBy("endDate"),
      limit(10),
    ),
  )
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as Challenge)
}

/**
 * The weekly set comes from a cron job; this is the fallback if it never ran.
 * Best effort only — the page reloads the list either way, and a 429 because
 * another student got there first is not an error worth showing anyone.
 */
async function requestWeeklyChallenges(idToken: string) {
  try {
    await fetch("/api/challenges/generate", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    })
  } catch {
    /* Offline or blocked; the list below will simply be empty. */
  }
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [taken, setTaken] = useState<Taken>({})
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [claimError, setClaimError] = useState("")

  const [active, setActive] = useState<Challenge | null>(null)
  const [questions, setQuestions] = useState<StoredQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<OptionLetter | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [standings, setStandings] = useState<Standing[]>([])

  /* The tally lives in a ref as well: the last answer is marked, then finished
     800ms later from a closure that would otherwise read a stale score. */
  const scoreRef = useRef(0)
  const answersRef = useRef<Record<string, OptionLetter>>({})
  const startedAtRef = useRef(0)
  const finishedRef = useRef(false)
  const finishRef = useRef<() => void>(() => {})

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false)
        return
      }
      try {
        const resultsSnap = await getDocs(
          query(collection(db, "challengeResults"), where("userId", "==", user.uid), limit(200)),
        )

        const mine: Taken = {}
        for (const entry of resultsSnap.docs) {
          const data = entry.data()
          if (typeof data.challengeId === "string") {
            mine[data.challengeId] = { score: data.score || 0, total: data.totalQuestions || 0 }
          }
        }
        setTaken(mine)

        let items = await fetchChallenges()
        if (items.length === 0) {
          await requestWeeklyChallenges(await user.getIdToken())
          items = await fetchChallenges()
        }
        setChallenges(items)
      } catch (err) {
        console.error("Failed to load the challenges:", err)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  const start = async (challenge: Challenge) => {
    setError("")
    setStarting(challenge.id)
    try {
      const snap = await getDocs(
        query(
          collection(db, "practiceQuestions"),
          where("subject", "==", challenge.subject),
          limit(QUESTION_POOL),
        ),
      )
      const pool = snap.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }) as StoredQuestion)
        .filter((question) => optionsOf(question).length >= 2 && correctLetterOf(question))

      if (pool.length < challenge.questionCount) {
        setError(
          `There are not enough ${challenge.subject} questions in the bank yet, so this challenge cannot run.`,
        )
        return
      }

      // Shuffle the pool, then take the questions: the old code took the first N
      // and shuffled those, so every attempt saw the same questions.
      const picked = shuffled(pool).slice(0, Math.max(1, challenge.questionCount))

      scoreRef.current = 0
      answersRef.current = {}
      setClaimError("")
      startedAtRef.current = Date.now()
      finishedRef.current = false

      setActive(challenge)
      setQuestions(picked)
      setIndex(0)
      setChosen(null)
      setResult(null)
      setStandings([])
      setTimeLeft(challenge.timeLimit)
      setRunning(true)
    } catch (err) {
      console.error("Failed to start the challenge:", err)
      setError("The challenge could not be loaded. Check your connection and try again.")
    } finally {
      setStarting(null)
    }
  }

  const finish = async () => {
    if (!active || finishedRef.current) return
    finishedRef.current = true
    setRunning(false)

    const total = questions.length
    const score = scoreRef.current
    const timeTaken = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    const user = auth.currentUser
    if (!user) return

    try {
      const idToken = await user.getIdToken()
      const response = await fetch("/api/gamification/add-coins", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          challengeId: active.id,
          answers: Object.fromEntries(questions.map((question) => [question.id!, answersRef.current[question.id!] ?? null])),
          timeTaken,
        }),
      })
      if (!response.ok) throw new Error("Challenge result could not be verified.")
      const saved = await response.json() as Result
      setResult(saved)
      setTaken((prev) => ({ ...prev, [active.id]: { score: saved.score, total: saved.total } }))

      // One equality filter, ranked in memory: ordering by score and then by time
      // behind that filter would need a composite index.
      const board = await getDocs(
        query(collection(db, "challengeResults"), where("challengeId", "==", active.id), limit(100)),
      )
      const rows = board.docs.map((entry) => entry.data() as Standing)
      rows.sort(
        (a, b) => (b.score || 0) - (a.score || 0) || (a.timeTaken || 0) - (b.timeTaken || 0),
      )
      setStandings(rows.slice(0, STANDINGS_SHOWN))
    } catch (err) {
      console.error("Failed to record your challenge:", err)
      setClaimError("Your score could not be saved. Your wallet was not credited. Check your connection and try another challenge later.")
      setResult({ score, total, timeTaken, coins: 0 })
    }
  }

  finishRef.current = finish

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => setTimeLeft((left) => Math.max(0, left - 1)), 1000)
    return () => clearInterval(interval)
  }, [running])

  /* Finishing is a side effect, so it happens here rather than inside the tick. */
  useEffect(() => {
    if (running && timeLeft === 0) finishRef.current()
  }, [running, timeLeft])

  const answer = (letter: OptionLetter) => {
    if (chosen) return
    setChosen(letter)
    const questionId = questions[index]?.id
    if (questionId) answersRef.current[questionId] = letter
    if (correctLetterOf(questions[index]) === letter) scoreRef.current += 1

    window.setTimeout(() => {
      if (index + 1 < questions.length) {
        setIndex((position) => position + 1)
        setChosen(null)
      } else {
        finishRef.current()
      }
    }, ADVANCE_MS)
  }

  const backToList = () => {
    setActive(null)
    setResult(null)
    setQuestions([])
    setStandings([])
  }

  if (loading) return <LoadingState full text="Loading this week's challenges…" />

  if (running && active && questions.length > 0) {
    const question = questions[index]
    const correct = correctLetterOf(question)
    const urgent = timeLeft <= URGENT_SECONDS

    return (
      <div className="animate-fade-in">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold tabular-nums text-muted">
              Question {index + 1} of {questions.length}
            </p>
            <ProgressBar
              className="mt-2"
              value={index + 1}
              max={questions.length}
              size="sm"
              valueLabel=""
              ariaLabel="Challenge progress"
            />
          </div>
          <p
            role="timer"
            aria-live="off"
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-body-sm font-semibold tabular-nums",
              urgent
                ? "border-danger/35 bg-danger/10 text-danger"
                : "border-hairline bg-surface text-muted",
            )}
          >
            <Timer size={15} aria-hidden="true" />
            {formatTime(timeLeft)}
          </p>
        </div>

        <section className="card p-5 sm:p-7">
          <p className="eyebrow mb-3">{active.subject}</p>
          <h1 className="text-h3 text-foreground">{richText(questionText(question))}</h1>

          <div className="mt-6 space-y-2.5">
            {optionsOf(question).map((option) => {
              const selected = chosen === option.letter
              const isCorrect = correct === option.letter
              const marked = chosen !== null

              return (
                <button
                  key={option.letter}
                  type="button"
                  disabled={marked}
                  onClick={() => answer(option.letter)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-4 py-3.5 text-left text-body-sm font-medium transition-colors disabled:cursor-default",
                    optionTone(selected, marked, isCorrect),
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-caption font-bold",
                      letterTone(selected, marked, isCorrect),
                    )}
                  >
                    {marked && isCorrect ? (
                      <Check size={13} aria-hidden="true" />
                    ) : marked && selected ? (
                      <X size={13} aria-hidden="true" />
                    ) : (
                      option.letter
                    )}
                  </span>
                  <span className="min-w-0">{richText(option.text)}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  if (result && active) {
    const percent = Math.round((result.score / Math.max(result.total, 1)) * 100)

    return (
      <div className="animate-fade-in">
        <PageHeader
          onBack={backToList}
          backLabel="All challenges"
          eyebrow="Compete"
          title="Challenge complete"
          subtitle={active.title}
        />
        {claimError && <p role="alert" className="mb-5 rounded-lg border border-danger/35 bg-danger/10 px-4 py-3 text-body-sm text-danger">{claimError}</p>}

        <section className="card p-5 sm:p-6">
          <dl className="grid grid-cols-3 divide-x divide-hairline text-center">
            <div className="px-2">
              <dd className="text-h3 font-semibold tabular-nums text-foreground">
                {result.score}/{result.total}
              </dd>
              <dt className="mt-1 text-overline uppercase text-subtle">Score</dt>
            </div>
            <div className="px-2">
              <dd className="text-h3 font-semibold tabular-nums text-foreground">
                {formatTime(result.timeTaken)}
              </dd>
              <dt className="mt-1 text-overline uppercase text-subtle">Time</dt>
            </div>
            <div className="px-2">
              <dd className="inline-flex items-center gap-1.5 text-h3 font-semibold tabular-nums text-coin">
                <Coins size={18} aria-hidden="true" />
                {result.coins}
              </dd>
              <dt className="mt-1 text-overline uppercase text-subtle">Coins won</dt>
            </div>
          </dl>

          <p className="mt-5 border-t border-hairline pt-5 text-body-sm text-muted">
            {percent === 100
              ? "Full marks. The prize is paid in full and your coins are already in your wallet."
              : percent >= 50
                ? `${percent}% — coins are paid in proportion, so a cleaner run next week pays more.`
                : `${percent}%. Practise the subject and come back to the next one.`}
          </p>
        </section>

        {standings.length > 0 && (
          <section className="card mt-6 p-5 sm:p-6">
            <h2 className="text-overline mb-4 uppercase text-subtle">Top of this challenge</h2>
            <ol className="divide-y divide-hairline">
              {standings.map((entry, position) => (
                <li key={position} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-caption font-bold tabular-nums",
                      position === 0
                        ? "bg-streak/[0.12] text-streak"
                        : "bg-surface-sunken text-subtle",
                    )}
                  >
                    {position + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-foreground">
                    {entry.displayName || "Student"}
                  </span>
                  <span className="shrink-0 text-body-sm font-semibold tabular-nums text-muted">
                    {entry.score || 0}/{entry.totalQuestions || 0}
                  </span>
                  <span className="w-12 shrink-0 text-right text-caption tabular-nums text-subtle">
                    {formatTime(entry.timeTaken || 0)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Compete"
        title="Weekly challenges"
        subtitle="A timed set of questions for Aero coins. One attempt each — the prize is paid in proportion to your score."
      />

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-danger/35 bg-danger/10 px-4 py-3 text-body-sm font-medium text-danger"
        >
          {error}
        </p>
      )}

      {challenges.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No challenge is running"
          description="Challenges are posted by an admin, and none has gone up yet. Practice pays 10 XP and 5 coins per correct answer in the meantime."
          actionText="Go to practice"
          actionHref="/app/practice"
        />
      ) : (
        <ul className="grid animate-fade-in gap-4 sm:grid-cols-2">
          {challenges.map((challenge) => {
            const done = taken[challenge.id]
            const days = daysLeft(challenge)

            return (
              <li key={challenge.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="eyebrow">{challenge.subject}</p>
                  <p className="inline-flex shrink-0 items-center gap-1.5 text-caption font-semibold tabular-nums text-coin">
                    <Coins size={14} aria-hidden="true" />
                    {challenge.prize}
                  </p>
                </div>

                <h2 className="mt-2 text-h4 font-semibold text-foreground">{challenge.title}</h2>
                <p className="mt-1.5 text-body-sm text-muted">{challenge.description}</p>

                <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-muted">
                  <div className="inline-flex items-center gap-1.5">
                    <ListChecks size={14} className="text-subtle" aria-hidden="true" />
                    <dt className="sr-only">Questions</dt>
                    <dd className="tabular-nums">{challenge.questionCount} questions</dd>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <Clock size={14} className="text-subtle" aria-hidden="true" />
                    <dt className="sr-only">Time limit</dt>
                    <dd className="tabular-nums">{Math.round(challenge.timeLimit / 60)} minutes</dd>
                  </div>
                  {days !== null && (
                    <div className="inline-flex items-center gap-1.5">
                      <Timer size={14} className="text-subtle" aria-hidden="true" />
                      <dt className="sr-only">Closes in</dt>
                      <dd className="tabular-nums">
                        {days === 0 ? "closes today" : `${days} day${days === 1 ? "" : "s"} left`}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="mt-5 border-t border-hairline pt-4">
                  {done ? (
                    <p className="inline-flex items-center gap-2 text-body-sm font-semibold text-success">
                      <Check size={15} aria-hidden="true" />
                      Done — you scored {done.score} of {done.total}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => start(challenge)}
                      disabled={starting !== null}
                      className="btn-primary w-full"
                    >
                      {starting === challenge.id ? "Loading questions…" : "Start challenge"}
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}









