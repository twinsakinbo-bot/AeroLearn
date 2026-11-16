"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Activity, BookOpen, Database, Loader2, Mail, RefreshCw } from "lucide-react"

import { auth } from "@/lib/auth"
import { PageHeader } from "@/components/ui/page-header"

type Outcome = {
  at?: string
  classLevel?: string
  subject?: string
  topicTitle?: string | null
  action?: string
  status?: string
  error?: string | null
  examType?: string
  year?: number
  imported?: number
  duplicates?: number
  removedByReview?: number
}
type Status = {
  lessonJob: { lastResults: Outcome[]; history: Outcome[]; sourceErrors: string[] }
  alocJob: { lastResult: Outcome | null; history: Outcome[] }
  email: { lastSentDay: string | null }
  counts: { published: number; awaitingReview: number; needsRevision: number; pendingReceipts: number }
  configured: { lessons: boolean; aloc: boolean; email: boolean; webSearch: boolean; webSearchProvider: string }
  schedules: Array<{ path: string; schedule: string }>
}

const JOBS = [
  { id: "lessons", label: "Lessons", path: "/api/automation/lessons", icon: BookOpen, description: "Plan, write, and AI review up to three NERDC lesson steps." },
  { id: "aloc", label: "ALOC questions", path: "/api/automation/aloc", icon: Database, description: "Fetch one batch, remove flagged questions, and skip duplicates." },
  { id: "email", label: "Admin email", path: "/api/automation/status-email", icon: Mail, description: "Send the receipt queue and latest job results to the admin email." },
] as const

function lagosTime(cron: string) {
  const [minute, hour] = cron.split(" ").map(Number)
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return cron
  const date = new Date(Date.UTC(2026, 0, 1, hour, minute))
  const local = new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit", hour12: true }).format(date)
  return `${local} Lagos time (${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} UTC)`
}

function describe(result: Outcome) {
  if (result.action) return `${result.classLevel || ""} ${result.subject || ""}${result.topicTitle ? ` · ${result.topicTitle}` : ""} · ${result.action}`
  return `${result.examType || ""} ${result.subject || ""} ${result.year || ""} · ${result.imported ?? 0} imported, ${result.removedByReview ?? 0} removed by review`
}

export default function AutomationPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    const user = auth.currentUser
    if (!user) throw new Error("Sign in as an admin first.")
    const token = await user.getIdToken()
    const response = await fetch("/api/admin/automation", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || "Could not load automation status.")
    setStatus(data as Status)
  }, [])

  useEffect(() => {
    let active = true
    load().catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load automation status.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load])

  const run = async (path: string, label: string) => {
    const user = auth.currentUser
    if (!user || running) return
    setRunning(path)
    setNotice("")
    setError("")
    try {
      const token = await user.getIdToken()
      const response = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.outcome?.error || data.error || `${label} failed.`)
      setNotice(`${label} finished. The results below are updated.`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${label} failed.`)
      await load().catch(() => {})
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Overview" title="Automation" subtitle="See what finished, what needs attention, and run a job when you choose." />
      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-body-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-4 text-body-sm text-success">{notice}</p>}
      {loading ? <p className="text-body-sm text-muted">Loading automation status…</p> : status && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Published lessons", status.counts.published, "/admin/curriculum"],
            ["Awaiting AI review", status.counts.awaitingReview, "/admin/lesson-generator"],
            ["Needs revision", status.counts.needsRevision, "/admin/lesson-generator"],
            ["Receipts to approve", status.counts.pendingReceipts, "/admin/subscriptions"],
          ].map(([label, value, href]) => <Link key={label} href={String(href)} className="card-interactive p-5">
            <span className="block text-caption text-muted">{label}</span><span className="mt-2 block text-h2 font-bold text-foreground">{value}</span>
          </Link>)}
        </div>
        <div className="flex justify-end"><button type="button" onClick={() => void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Refresh failed."))} className="btn-secondary btn-sm"><RefreshCw size={15} /> Refresh</button></div>
        <section className="grid gap-4 lg:grid-cols-3" aria-label="Automation jobs">
          {JOBS.map((job) => {
            const schedule = status.schedules.find((item) => item.path === job.path)?.schedule
            const configured = status.configured[job.id]
            const Icon = job.icon
            return <div key={job.id} className="card flex flex-col p-5">
              <div className="flex items-center gap-3"><Icon size={21} className="text-accent" /><h2 className="text-h4 text-foreground">{job.label}</h2></div>
              <p className="mt-3 flex-1 text-body-sm text-muted">{job.description}</p>
              <p className="mt-4 text-caption text-muted">Daily around {schedule ? lagosTime(schedule) : "the configured time"}. Vercel Hobby may run within the scheduled hour.</p>
              <p className={`mt-2 text-caption font-semibold ${configured ? "text-success" : "text-warn"}`}>{configured ? "Ready" : "Missing server setup"}</p>
              <button type="button" disabled={!configured || Boolean(running)} onClick={() => void run(job.path, job.label)} className="btn-primary btn-sm mt-4 w-full">
                {running === job.path ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />} Run now
              </button>
            </div>
          })}
        </section>
        <section className="card p-5 sm:p-6">
          <h2 className="text-h4 text-foreground">Recent job results</h2>
          <div className="mt-4 space-y-3">
            {[...status.lessonJob.history, ...status.alocJob.history].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 20).map((item, index) =>
              <div key={`${item.at}-${index}`} className="rounded-lg border border-hairline p-3 text-body-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-foreground">{describe(item)}</strong><span className={item.status === "failed" || item.status === "needs_revision" ? "text-danger" : "text-success"}>{item.status || "done"}</span></div>
                {item.error && <p className="mt-1 text-danger">{item.error}</p>}
                <p className="mt-1 text-caption text-muted">{item.at ? new Date(item.at).toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) : ""}</p>
              </div>)}
            {!status.lessonJob.history.length && !status.alocJob.history.length && <p className="text-body-sm text-muted">No scheduled run has finished yet. Use Run now or wait for the next daily run.</p>}
          </div>
        </section>
        {status.lessonJob.sourceErrors.length > 0 && <section className="card p-5 sm:p-6"><h2 className="text-h4 text-foreground">NERDC sources needing attention</h2><p className="mt-2 text-body-sm text-muted">The lesson job checks these sources again on its next run. It skips a class when its official curriculum is unavailable.</p><ul className="mt-3 list-disc space-y-1 pl-5 text-body-sm text-muted">{status.lessonJob.sourceErrors.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
        <p className="text-body-sm text-muted">Last admin status email: {status.email.lastSentDay || "not sent yet"}. Tutor reference search: {status.configured.webSearchProvider === "wikipedia" ? "Wikipedia (free, no key)" : status.configured.webSearchProvider}.</p>
      </>}
    </div>
  )
}
