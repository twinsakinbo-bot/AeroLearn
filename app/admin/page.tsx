"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  collection,
  db,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  type Timestamp,
  where,
} from "@/lib/db"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ClipboardList,
  Database,
  FileText,
  HelpCircle,
  RefreshCw,
  Sparkles,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState, Skeleton } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { cn } from "@/lib/utils"

/**
 * Admin overview.
 *
 * Four real bugs fixed:
 *
 * 1. **The page downloaded the entire question bank to show five rows.** The
 *    activity feed ran `getDocs(collection(db, "practiceQuestions"))` with no
 *    limit, on top of the `getCountFromServer` the stats already did. On a bank
 *    of 20,000 questions that is 20,000 document reads and several megabytes,
 *    every time an admin opened the dashboard. It is `orderBy("createdAt",
 *    "desc") limit(6)` now.
 * 2. **It also downloaded every user document** just to count students, then
 *    filtered `role !== "admin"` in memory — the admin's browser held every
 *    student record on the platform. Two aggregate counts replace it (all users
 *    minus admins), which never transfers a document. The old `!=` filter could
 *    not be pushed to the server anyway: Firestore's `!=` skips documents that
 *    have no `role` field, which is most students.
 * 3. **"Refresh Data" called `window.location.reload()`** — a full reload that
 *    re-ran the auth gate and threw away the shell. It re-runs the queries now
 *    and shows that it is working.
 * 4. **"View All Activity" was a dead button** with no handler and no page
 *    behind it, and every tile carried a "Live" chip although the data is a
 *    one-shot fetch. Both removed.
 *
 * The activity feed reads lesson documents to show recent lesson and homework
 * changes. The same read counts lessons that passed the AI review pipeline.
 */

type Metric = {
  label: string
  value: number | null
  icon: LucideIcon
  tone: "accent" | "brand" | "success" | "warn"
  hint: string
  href: string
}

type Feed = {
  id: string
  kind: "question" | "lesson" | "homework"
  title: string
  detail: string
  at: Date
}

const KIND_META: Record<Feed["kind"], { icon: LucideIcon; chip: string }> = {
  question: { icon: HelpCircle, chip: "bg-accent/10 text-accent" },
  lesson: { icon: FileText, chip: "bg-success/10 text-success" },
  homework: { icon: ClipboardList, chip: "bg-warn/10 text-warn" },
}

const QUICK_ACTIONS: { label: string; hint: string; href: string; icon: LucideIcon }[] = [
  { label: "Import questions", hint: "Upload a CSV or JSON of past questions", href: "/admin/question-importer", icon: Upload },
  { label: "Sync with ALOC", hint: "Pull free past questions over the API", href: "/admin/aloc-sync", icon: Database },
  { label: "Generate lessons", hint: "Write and AI review current NERDC topics", href: "/admin/lesson-generator", icon: Sparkles },
  { label: "Edit a lesson", hint: "Fix note content, examples and homework", href: "/admin/lesson-editor", icon: FileText },
  { label: "Curriculum", hint: "Subjects, terms and topic ordering", href: "/admin/curriculum", icon: BookOpen },
  { label: "Students", hint: "Accounts, class levels and progress", href: "/admin/students", icon: Users },
]

/* Firestore hands back a Timestamp, an ISO string or nothing at all depending on
   which importer wrote the row, so normalise before sorting on it. */
function toDate(value: unknown): Date | null {
  if (!value) return null
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = (value as Timestamp).toDate()
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(value as string)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const MINUTE = 60_000
const DAY = 86_400_000

function timeAgo(date: Date) {
  const diff = Date.now() - date.getTime()
  if (diff < MINUTE) return "just now"
  if (diff < 60 * MINUTE) return `${Math.round(diff / MINUTE)}m ago`
  if (diff < DAY) return `${Math.round(diff / (60 * MINUTE))}h ago`
  if (diff < 7 * DAY) return `${Math.round(diff / DAY)}d ago`
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

const INITIAL_METRICS: Metric[] = [
  { label: "Students", value: null, icon: Users, tone: "accent", hint: "Excluding staff accounts", href: "/admin/students" },
  { label: "Questions", value: null, icon: HelpCircle, tone: "brand", hint: "In the practice bank", href: "/admin/questions" },
  { label: "Lessons", value: null, icon: FileText, tone: "success", hint: "Published notes", href: "/admin/curriculum" },
  { label: "AI-reviewed lessons", value: null, icon: Sparkles, tone: "warn", hint: "Published after AI review", href: "/admin/lesson-generator" },
]

export default function AdminOverview() {
  const [metrics, setMetrics] = useState<Metric[]>(INITIAL_METRICS)
  const [feed, setFeed] = useState<Feed[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [allUsers, staff, questions, lessonSnap, latestQuestions] = await Promise.all([
        getCountFromServer(collection(db, "users")),
        getCountFromServer(query(collection(db, "users"), where("role", "==", "admin"))),
        getCountFromServer(collection(db, "practiceQuestions")),
        getDocs(collection(db, "lessons")),
        getDocs(query(collection(db, "practiceQuestions"), orderBy("createdAt", "desc"), limit(6))),
      ])

      let homework = 0
      let aiReviewed = 0
      const rows: Feed[] = []

      lessonSnap.docs.forEach((entry) => {
        const data = entry.data()
        const tasks = Array.isArray(data.homework) ? data.homework.length : 0
        homework += tasks
        if (data.aiReviewedAt) aiReviewed++

        const at = toDate(data.createdAt)
        if (!at) return
        const detail =
          [data.classLevel, data.subject, data.topicTitle].filter(Boolean).join(" · ") || "Untitled lesson"

        rows.push({ id: entry.id, kind: "lesson", title: "Lesson published", detail, at })
        if (tasks > 0) {
          rows.push({
            id: `${entry.id}-homework`,
            kind: "homework",
            title: `${tasks} homework question${tasks === 1 ? "" : "s"} attached`,
            detail,
            at,
          })
        }
      })

      latestQuestions.docs.forEach((entry) => {
        const data = entry.data()
        const at = toDate(data.createdAt)
        if (!at) return
        rows.push({
          id: entry.id,
          kind: "question",
          title: "Question added",
          detail: [data.exam, data.year, data.subject].filter(Boolean).join(" · ") || "Practice question",
          at,
        })
      })

      rows.sort((a, b) => b.at.getTime() - a.at.getTime())
      setFeed(rows.slice(0, 6))

      const students = Math.max(allUsers.data().count - staff.data().count, 0)
      const totals: Record<string, number> = {
        Students: students,
        Questions: questions.data().count,
        Lessons: lessonSnap.size,
        "AI-reviewed lessons": aiReviewed,
      }
      setMetrics(INITIAL_METRICS.map((metric) => ({ ...metric, value: totals[metric.label] ?? null })))
    } catch (cause) {
      console.error("Admin overview failed to load:", cause)
      setError(cause instanceof Error ? cause.message : "The database did not respond.")
      setMetrics(INITIAL_METRICS)
      setFeed([])
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Admin"
        title="Platform overview"
        subtitle="Content and account totals, plus what has changed recently."
        actions={
          <button type="button" onClick={() => void load()} disabled={busy} className="btn-secondary btn-sm">
            <RefreshCw size={15} className={cn(busy && "animate-spin")} aria-hidden="true" />
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-body-sm font-semibold text-foreground">Could not read the database</p>
            <p className="mt-0.5 break-words text-caption text-muted">{error}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) =>
          metric.value === null ? (
            <div key={metric.label} className="card p-5">
              <p className="text-overline uppercase text-subtle">{metric.label}</p>
              <Skeleton className="mt-3 h-8 w-20 rounded-lg" />
              <Skeleton className="mt-2 h-3 w-28 rounded" />
            </div>
          ) : (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value.toLocaleString()}
              icon={metric.icon}
              tone={metric.tone}
              hint={metric.hint}
              href={metric.href}
            />
          ),
        )}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-h4 font-semibold">
            <Activity size={18} className="text-muted" aria-hidden="true" />
            Recent activity
          </h2>

          <div className="card overflow-hidden p-0">
            {busy ? (
              <div className="p-8">
                <LoadingState text="Reading the content bank…" />
              </div>
            ) : feed.length === 0 ? (
              <EmptyState
                icon={Activity}
                bordered={false}
                title="Nothing recorded yet"
                description="Lessons and questions appear here once they carry a created date. Imports written before that field existed will not show up."
                actionText="Import questions"
                actionHref="/admin/question-importer"
              />
            ) : (
              <ul className="divide-y divide-hairline">
                {feed.map((row) => {
                  const meta = KIND_META[row.kind]
                  const Icon = meta.icon
                  return (
                    <li key={row.id} className="flex items-center gap-4 px-5 py-4">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meta.chip)}>
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm font-semibold text-foreground">{row.title}</span>
                        <span className="block truncate text-caption text-muted">{row.detail}</span>
                      </span>
                      <time
                        dateTime={row.at.toISOString()}
                        title={row.at.toLocaleString()}
                        className="shrink-0 text-caption tabular-nums text-subtle"
                      >
                        {timeAgo(row.at)}
                      </time>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-h4 font-semibold">
            <ArrowRight size={18} className="text-muted" aria-hidden="true" />
            Quick actions
          </h2>

          <ul className="space-y-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <li key={action.href}>
                  <Link href={action.href} className="card-interactive group flex items-center gap-3 p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-muted transition-colors group-hover:bg-accent/10 group-hover:text-accent">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-semibold text-foreground">{action.label}</span>
                      <span className="block truncate text-caption text-muted">{action.hint}</span>
                    </span>
                    <ArrowRight
                      size={16}
                      className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
