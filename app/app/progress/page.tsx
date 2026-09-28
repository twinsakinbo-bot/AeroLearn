"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { collection, db, doc, getDoc, getDocs, query, where } from "@/lib/db"
import { BookOpen, Coins, Flame, Lock, Target, Zap } from "lucide-react"

import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { ProgressBar } from "@/components/ui/progress-bar"
import { StatCard } from "@/components/ui/stat-card"
import { BADGES } from "@/lib/constants"
import { cn } from "@/lib/utils"

/**
 * Everything the app actually knows about a student's effort, in one place.
 *
 * Two things used to be on this page that could never work: an "XP History"
 * ledger reading `earningsHistory`, a field nothing in the codebase writes, and
 * a badge shelf reading `users/{uid}.badges`, which is initialised to `[]` and
 * likewise never written — plus one hardcoded fake locked badge to fill the
 * grid. The ledger is gone. The shelf stayed, but badges are now *derived* here
 * from counters that are genuinely maintained, so the eight in `BADGES` unlock
 * on their own and each locked one shows how far off it is.
 */

type Stats = {
  xp: number
  coins: number
  streak: number
  bestStreak: number
  lessons: number
  attempted: number
  correct: number
  subjects: number
  quizzes: number
  perfect: number
  homework: number
}

const EMPTY: Stats = {
  xp: 0,
  coins: 0,
  streak: 0,
  bestStreak: 0,
  lessons: 0,
  attempted: 0,
  correct: 0,
  subjects: 0,
  quizzes: 0,
  perfect: 0,
  homework: 0,
}

/** Each badge requirement, mapped to the counter that satisfies it. */
function progressFor(type: string, stats: Stats) {
  switch (type) {
    case "lessons_completed":
      return stats.lessons
    case "quizzes_completed":
      return stats.quizzes
    case "total_xp":
      return stats.xp
    case "streak":
      return stats.bestStreak
    case "questions_answered":
      return stats.attempted
    case "homework_completed":
      return stats.homework
    case "subjects_studied":
      return stats.subjects
    case "perfect_quizzes":
      return stats.perfect
    default:
      return 0
  }
}

/**
 * Profile counters, the student's quiz results and their completed homework,
 * fetched together. Quiz results are the only source for "how many quizzes" and
 * "any perfect scores" — neither is kept on the profile.
 */
async function loadStats(uid: string): Promise<Stats> {
  const [profileSnap, quizSnap, homeworkSnap] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    getDocs(query(collection(db, "quizResults"), where("userId", "==", uid))),
    getDocs(
      query(collection(db, "homeworkSubmissions"), where("studentId", "==", uid)),
    ),
  ])

  const data = profileSnap.exists() ? profileSnap.data() : {}
  const studyStats = (data.studyStats ?? {}) as {
    questionsAttempted?: number
    questionsCorrect?: number
    subjectsStudied?: string[]
  }

  let perfect = 0
  quizSnap.forEach((result) => {
    const { score = 0, totalQuestions = 0 } = result.data()
    if (totalQuestions > 0 && score >= totalQuestions) perfect += 1
  })

  // Status is filtered here rather than in the query: a second equality filter
  // would need a composite index, and the document set is the same either way.
  let homework = 0
  homeworkSnap.forEach((submission) => {
    if (submission.data().status === "completed") homework += 1
  })

  const streak: number = data.streak || 0

  return {
    xp: data.xp || 0,
    coins: data.coins || 0,
    streak,
    bestStreak: Math.max(streak, data.longestStreak || 0),
    lessons: Array.isArray(data.completedLessons) ? data.completedLessons.length : 0,
    attempted: studyStats.questionsAttempted || 0,
    correct: studyStats.questionsCorrect || 0,
    subjects: studyStats.subjectsStudied?.length || 0,
    quizzes: quizSnap.size,
    perfect,
    homework,
  }
}

export default function ProgressPage() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        return
      }
      try {
        setStats(await loadStats(user.uid))
      } catch (err) {
        console.error("Failed to load progress:", err)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [router])

  if (loading) return <LoadingState full text="Loading your progress…" />

  const accuracy = stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0
  const earned = BADGES.filter(
    (badge) => progressFor(badge.requirement.type, stats) >= badge.requirement.value,
  ).length

  return (
    <>
      <PageHeader
        eyebrow="Progress"
        title="Your progress"
        subtitle="Everything you have earned so far, and how close you are to the next badge."
      />

      <div className="mb-6 grid animate-fade-in grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Streak"
          value={stats.streak}
          icon={Flame}
          tone="streak"
          hint={stats.bestStreak > 0 ? `Best: ${stats.bestStreak} days` : "Study today to start one"}
        />
        <StatCard label="Total XP" value={stats.xp.toLocaleString()} icon={Zap} tone="accent" />
        <StatCard label="Aero coins" value={stats.coins.toLocaleString()} icon={Coins} tone="warn" />
        <StatCard label="Lessons done" value={stats.lessons} icon={BookOpen} tone="success" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-overline uppercase text-subtle">Practice accuracy</h2>
          {stats.attempted === 0 ? (
            <p className="mt-3 text-body-sm text-muted">
              You have not answered any practice questions yet. Your accuracy appears here after the
              first one.
            </p>
          ) : (
            <>
              <p className="mt-3 text-h2 font-bold tabular-nums text-foreground">{accuracy}%</p>
              <ProgressBar
                className="mt-3"
                value={stats.correct}
                max={stats.attempted}
                size="sm"
                valueLabel=""
                tone={accuracy >= 70 ? "success" : accuracy >= 40 ? "warn" : "danger"}
                ariaLabel="Practice accuracy"
              />
              <p className="mt-2 text-caption text-muted">
                {stats.correct.toLocaleString()} correct out of {stats.attempted.toLocaleString()}{" "}
                answered.
              </p>
            </>
          )}

          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-hairline pt-4">
            {[
              { label: "Quizzes", value: stats.quizzes },
              { label: "Perfect", value: stats.perfect },
              { label: "Subjects", value: stats.subjects },
            ].map((cell) => (
              <div key={cell.label}>
                <dt className="text-caption text-muted">{cell.label}</dt>
                <dd className="text-body font-semibold tabular-nums text-foreground">
                  {cell.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <Link href="/app/weak-topics" className="card-interactive flex flex-col justify-between p-5">
          <div>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Target size={19} aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-h4 font-semibold text-foreground">Strengths and gaps</h2>
            <p className="mt-2 text-body-sm text-muted">
              A subject-by-subject breakdown of your quiz accuracy, with the weakest first and a
              practice link for each one.
            </p>
          </div>
          <span className="mt-4 text-caption font-semibold text-accent">
            See the breakdown →
          </span>
        </Link>
      </div>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-h4 font-semibold text-foreground">Badges</h2>
          <p className="text-caption text-muted">
            {earned} of {BADGES.length} earned
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {BADGES.map((badge) => {
            const target = badge.requirement.value
            const current = progressFor(badge.requirement.type, stats)
            const unlocked = current >= target

            return (
              <li
                key={badge.id}
                className={cn(
                  "flex flex-col items-center rounded-xl border p-4 text-center",
                  unlocked
                    ? "border-accent/30 bg-accent/[0.06]"
                    : "border-hairline bg-surface-sunken",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-12 w-12 items-center justify-center rounded-full border text-xl",
                    unlocked
                      ? "border-accent/30 bg-surface"
                      : "border-hairline bg-surface text-subtle",
                  )}
                >
                  {unlocked ? badge.icon : <Lock size={18} aria-hidden="true" />}
                </span>

                <p
                  className={cn(
                    "mt-3 text-body-sm font-semibold",
                    unlocked ? "text-foreground" : "text-muted",
                  )}
                >
                  {badge.name}
                </p>
                <p className="mt-1 text-caption text-muted">
                  {unlocked ? "Earned" : badge.description}
                </p>
                {!unlocked && (
                  <p className="mt-2 text-caption font-semibold tabular-nums text-subtle">
                    {Math.min(current, target).toLocaleString()} / {target.toLocaleString()}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}

