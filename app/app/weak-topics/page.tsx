"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { collection, db, doc, getDoc, getDocs, query, where } from "@/lib/db"
import { ChevronRight, Compass, Target, TrendingDown, TrendingUp } from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { ProgressBar } from "@/components/ui/progress-bar"
import { StatCard } from "@/components/ui/stat-card"
import { cn } from "@/lib/utils"

/**
 * Where a student is strong and where they are not, per subject.
 *
 * This is an accuracy average over answered quiz questions, and the page says
 * so rather than calling itself an AI analysis — a student who trusts the
 * number needs to know what produced it. Challenge results are left out on
 * purpose: a challenge mixes subjects and is stored without one, so it cannot
 * be attributed to any single row here.
 */

/** Under this many answered questions a subject gets a count, not a verdict. */
const MIN_SAMPLE = 5

type Status = "weak" | "moderate" | "untested" | "strong"

type SubjectAnalysis = {
  subject: string
  attempted: number
  correct: number
  accuracy: number
  status: Status
}

/** `rank` is the display order: what needs attention first comes first. */
const STATUS_META: Record<Status, { label: string; text: string; chip: string; rank: number }> = {
  weak: { label: "Needs work", text: "text-danger", chip: "badge-danger", rank: 0 },
  moderate: { label: "Getting there", text: "text-warn", chip: "badge-warn", rank: 1 },
  untested: { label: "Not started", text: "text-subtle", chip: "badge-neutral", rank: 2 },
  strong: { label: "Strong", text: "text-success", chip: "badge-success", rank: 3 },
}

function statusOf(attempted: number, accuracy: number): Status {
  if (attempted < MIN_SAMPLE) return "untested"
  if (accuracy >= 70) return "strong"
  if (accuracy >= 40) return "moderate"
  return "weak"
}

/**
 * Aggregates every stored quiz result into one row per subject. The student's
 * chosen subjects are seeded first so a subject they have never touched still
 * appears — that absence is itself the useful signal.
 */
async function analyse(uid: string, subjects: string[]): Promise<SubjectAnalysis[]> {
  const totals: Record<string, { attempted: number; correct: number }> = {}
  for (const subject of subjects) {
    totals[subject] = { attempted: 0, correct: 0 }
  }

  const results = await getDocs(query(collection(db, "quizResults"), where("userId", "==", uid)))
  results.forEach((result) => {
    const data = result.data()
    const subject: string | undefined = data.subject
    if (!subject) return
    if (!totals[subject]) totals[subject] = { attempted: 0, correct: 0 }
    totals[subject].attempted += data.totalQuestions || 0
    totals[subject].correct += data.score || 0
  })

  return Object.entries(totals)
    .map(([subject, { attempted, correct }]) => {
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0
      return { subject, attempted, correct, accuracy, status: statusOf(attempted, accuracy) }
    })
    .sort(
      (a, b) =>
        STATUS_META[a.status].rank - STATUS_META[b.status].rank || a.accuracy - b.accuracy,
    )
}

export default function WeakTopicsPage() {
  const [loading, setLoading] = useState(true)
  const [analysis, setAnalysis] = useState<SubjectAnalysis[]>([])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        setAnalysis(await analyse(user.uid, snap.exists() ? snap.data().subjects || [] : []))
      } catch (err) {
        console.error("Failed to analyse performance:", err)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  if (loading) {
    return <LoadingState full text="Working through your quiz history…" />
  }

  const weak = analysis.filter((row) => row.status === "weak")
  const moderate = analysis.filter((row) => row.status === "moderate")
  const strong = analysis.filter((row) => row.status === "strong")
  const tested = analysis.filter((row) => row.status !== "untested")

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Strengths and gaps"
        subtitle={`Accuracy across every quiz you have taken, one row per subject. A subject needs ${MIN_SAMPLE} answered questions before it gets a verdict.`}
        actions={
          <Link href="/app/practice" className="btn-secondary btn-sm">
            Practice a subject
          </Link>
        }
      />

      {analysis.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="Nothing to measure yet"
          description="Pick your subjects and answer a few quiz questions — this page fills in from your results."
          actionText="Start practising"
          actionHref="/app/practice"
          suggestions={[
            { title: "Choose your subjects", href: "/app/settings" },
            { title: "Take a quick quiz", href: "/app/practice" },
          ]}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={TrendingDown}
              tone="danger"
              label="Needs work"
              value={weak.length}
              hint="Under 40% correct"
            />
            <StatCard
              icon={Target}
              tone="warn"
              label="Getting there"
              value={moderate.length}
              hint="40–69% correct"
            />
            <StatCard
              icon={TrendingUp}
              tone="success"
              label="Strong"
              value={strong.length}
              hint="70% or better"
            />
          </div>

          <ul className="mt-8 space-y-3">
            {analysis.map((row) => {
              const meta = STATUS_META[row.status]
              const untested = row.status === "untested"

              return (
                <li key={row.subject} className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <h2 className="text-body font-semibold text-foreground">{row.subject}</h2>
                    <div className="flex items-center gap-2.5">
                      <span className={cn("text-body-sm font-bold tabular-nums", meta.text)}>
                        {untested ? "—" : `${row.accuracy}%`}
                      </span>
                      <span className={meta.chip}>{meta.label}</span>
                    </div>
                  </div>

                  {!untested && (
                    <ProgressBar
                      className="mt-3.5"
                      value={row.accuracy}
                      size="sm"
                      valueLabel=""
                      ariaLabel={`${row.subject} accuracy`}
                      tone={
                        row.status === "strong"
                          ? "success"
                          : row.status === "moderate"
                            ? "warn"
                            : "danger"
                      }
                    />
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                    <p className="text-caption text-muted">
                      {row.attempted === 0
                        ? "No questions answered yet"
                        : `${row.correct} of ${row.attempted} answered correctly${
                            untested ? ` — ${MIN_SAMPLE - row.attempted} more for a verdict` : ""
                          }`}
                    </p>
                    <Link
                      href={`/app/practice?subject=${encodeURIComponent(row.subject)}`}
                      className="inline-flex items-center gap-1 text-caption font-semibold text-accent hover:underline"
                    >
                      Practise {row.subject}
                      <ChevronRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>

          {weak.length > 0 && (
            <aside className="mt-8 rounded-xl border border-accent/25 bg-accent/[0.06] p-5 sm:p-6">
              <h2 className="text-h4 font-semibold text-foreground">What to do next</h2>
              <p className="mt-2 text-body-sm text-muted">
                Your weakest {weak.length === 1 ? "subject is" : "subjects are"}{" "}
                <strong className="font-semibold text-foreground">
                  {weak.map((row) => row.subject).join(", ")}
                </strong>
                . Twenty practice questions in each is usually enough to move the number — and your
                timetable can be reordered to give them the earlier slots.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/app/practice?subject=${encodeURIComponent(weak[0].subject)}`}
                  className="btn-primary btn-sm"
                >
                  Practise {weak[0].subject}
                </Link>
                <Link href="/app/timetable" className="btn-secondary btn-sm">
                  Reorder my timetable
                </Link>
              </div>
            </aside>
          )}

          {weak.length === 0 && tested.length > 0 && (
            <aside className="mt-8 rounded-xl border border-success/25 bg-success/[0.06] p-5 sm:p-6">
              <h2 className="text-h4 font-semibold text-foreground">Nothing is falling behind</h2>
              <p className="mt-2 text-body-sm text-muted">
                Every subject with enough answered questions is at 40% or better. Keep going, or
                start a subject you have not tried yet.
              </p>
            </aside>
          )}
        </>
      )}
    </>
  )
}
