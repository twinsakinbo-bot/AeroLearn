"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { collection, db, doc, getDoc, getDocs, query, where } from "@/lib/db"
import { CalendarClock, CheckCircle2, ClipboardList, TriangleAlert } from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { Tabs } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

/**
 * Homework set for the student's class. Read-only: nothing in the app writes to
 * `homeworkSubmissions` yet, so an item's state comes from whatever a teacher
 * has recorded plus its own due date. The per-item action therefore points at
 * something that does exist — practice on the same subject — rather than a
 * "Start" button that had nowhere to go.
 */

type Tab = "all" | "todo" | "in_progress" | "completed"

type Homework = {
  id: string
  title?: string
  description?: string
  subject?: string
  topic?: string
  dueDate?: { toDate?: () => Date } | null
}

type Submission = {
  id: string
  homeworkId?: string
  status?: string
}

type Status = "completed" | "in_progress" | "overdue" | "assigned"

const STATUS_META: Record<Status, { label: string; chip: string }> = {
  completed: { label: "Done", chip: "badge-success" },
  in_progress: { label: "In progress", chip: "badge-warn" },
  overdue: { label: "Overdue", chip: "badge-danger" },
  assigned: { label: "To do", chip: "badge-neutral" },
}

/** Firestore hands back a Timestamp; a hand-written doc might hold anything. */
function toDate(value: Homework["dueDate"]) {
  const date = value?.toDate?.()
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
}

/** Whole days from today to `due`, negative once it has passed. */
function daysUntil(due: Date) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfDue = new Date(due)
  startOfDue.setHours(0, 0, 0, 0)
  return Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000)
}

function dueLabel(due: Date | null) {
  if (!due) return "No due date"
  const days = daysUntil(due)
  if (days === 0) return "Due today"
  if (days === 1) return "Due tomorrow"
  if (days === -1) return "Due yesterday"
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days <= 7) return `Due in ${days} days`
  return `Due ${due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
}

export default function HomeworkPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [homework, setHomework] = useState<Homework[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("all")

  /* One pass: profile, then this class's published homework and the student's
     own submissions together, so the list never renders half-resolved. */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        return
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        const data = snap.exists() ? snap.data() : null
        setProfile(data)

        const classLevel = data?.classLevel
        const [homeworkSnap, submissionSnap] = await Promise.all([
          classLevel
            ? getDocs(
                query(
                  collection(db, "homework"),
                  where("classLevel", "==", classLevel),
                  where("status", "==", "published"),
                ),
              )
            : null,
          getDocs(
            query(collection(db, "homeworkSubmissions"), where("studentId", "==", user.uid)),
          ),
        ])

        if (homeworkSnap) {
          setHomework(homeworkSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Homework))
        }
        setSubmissions(submissionSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Submission))
      } catch (err) {
        console.error("Failed to load homework:", err)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [router])

  const statusOf = (item: Homework): Status => {
    const submission = submissions.find((s) => s.homeworkId === item.id)
    if (submission?.status === "completed") return "completed"
    if (submission?.status === "in_progress") return "in_progress"
    const due = toDate(item.dueDate)
    return due && daysUntil(due) < 0 ? "overdue" : "assigned"
  }

  if (loading) return <LoadingState full text="Loading your homework…" />

  if (!profile?.onboardingCompleted) {
    return (
      <>
        <PageHeader title="Homework" subtitle="Assignments set for your class." />
        <EmptyState
          icon={ClipboardList}
          title="Finish setting up first"
          description="Homework is matched to your class, so we need to know which class you are in."
          actionText="Complete setup"
          actionHref="/onboarding"
        />
      </>
    )
  }

  const withStatus = homework.map((item) => ({ item, status: statusOf(item) }))
  const counts = {
    all: withStatus.length,
    todo: withStatus.filter((r) => r.status === "assigned" || r.status === "overdue").length,
    in_progress: withStatus.filter((r) => r.status === "in_progress").length,
    completed: withStatus.filter((r) => r.status === "completed").length,
  }

  const visible = withStatus
    .filter(({ status }) => {
      if (tab === "all") return true
      if (tab === "todo") return status === "assigned" || status === "overdue"
      return status === tab
    })
    .sort((a, b) => {
      const dueA = toDate(a.item.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY
      const dueB = toDate(b.item.dueDate)?.getTime() ?? Number.POSITIVE_INFINITY
      return dueA - dueB
    })

  const overdue = counts.todo > 0 ? withStatus.filter((r) => r.status === "overdue").length : 0

  return (
    <>
      <PageHeader
        eyebrow="Assignments"
        title="Homework"
        subtitle={
          overdue > 0
            ? `${overdue} ${overdue === 1 ? "assignment is" : "assignments are"} past its due date.`
            : "Everything set for your class, soonest first."
        }
      />

      <Tabs
        className="mb-6"
        ariaLabel="Homework status"
        value={tab}
        onChange={setTab}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "todo", label: "To do", count: counts.todo },
          { value: "in_progress", label: "In progress", count: counts.in_progress },
          { value: "completed", label: "Done", count: counts.completed },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={counts.all === 0 ? ClipboardList : CheckCircle2}
          title={counts.all === 0 ? "No homework set" : "Nothing in this section"}
          description={
            counts.all === 0
              ? "When your teacher publishes an assignment for your class it will appear here."
              : "Try another tab — or get ahead with some practice."
          }
          actionText="Practise instead"
          actionHref="/app/practice"
        />
      ) : (
        <ul className="space-y-3">
          {visible.map(({ item, status }) => {
            const meta = STATUS_META[status]
            const due = toDate(item.dueDate)
            const urgent = status === "overdue" || (due !== null && daysUntil(due) <= 1)

            return (
              <li
                key={item.id}
                className={cn("card p-5", status === "overdue" && "border-danger/30")}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h2 className="text-body font-semibold text-foreground">
                      {item.title || "Untitled assignment"}
                    </h2>
                    <p className="mt-0.5 text-caption text-muted">
                      {[item.subject, item.topic].filter(Boolean).join(" · ") || "General"}
                    </p>
                  </div>
                  <span className={meta.chip}>{meta.label}</span>
                </div>

                {item.description && (
                  <p className="mt-3 line-clamp-2 text-body-sm text-muted">{item.description}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hairline pt-3.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-caption font-semibold",
                      status === "completed"
                        ? "text-success"
                        : urgent
                          ? "text-danger"
                          : "text-muted",
                    )}
                  >
                    {status === "completed" ? (
                      <CheckCircle2 size={14} aria-hidden="true" />
                    ) : urgent ? (
                      <TriangleAlert size={14} aria-hidden="true" />
                    ) : (
                      <CalendarClock size={14} aria-hidden="true" />
                    )}
                    {status === "completed" ? "Submitted" : dueLabel(due)}
                  </span>

                  {item.subject && (
                    <Link
                      href={`/app/practice?subject=${encodeURIComponent(item.subject)}`}
                      className="btn-secondary btn-sm"
                    >
                      Practise {item.subject}
                    </Link>
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
