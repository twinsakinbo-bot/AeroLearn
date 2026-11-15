"use client"

import { useEffect, useRef, useState } from "react"
import { BookOpen, Loader2, RefreshCw, Sparkles } from "lucide-react"

import { PageHeader } from "@/components/ui/page-header"
import { auth } from "@/lib/auth"
import { CLASS_LEVELS } from "@/lib/constants"

type Topic = { title: string; term: string; scope: string }
type Plan = { classLevel: string; subject: string; sourceTitle: string; sourceUrl: string; topics: Topic[] }
type Draft = Topic & {
  classLevel: string
  subject: string
  content: string
  status: "awaiting_ai_review" | "needs_revision" | "published"
  review?: { approved: boolean; issues: string[] }
}

async function pipeline(method: "GET" | "POST", params: Record<string, string>) {
  const user = auth.currentUser
  if (!user) throw new Error("Your session is still loading. Try again or sign in again.")
  const token = await user.getIdToken()
  const url = method === "GET"
    ? `/api/lessons/pipeline?${new URLSearchParams(params)}`
    : "/api/lessons/pipeline"
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
    ...(method === "POST" ? { body: JSON.stringify(params) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data
}

export default function LessonGeneratorPage() {
  const [classLevel, setClassLevel] = useState<string>("JSS 1")
  const [subjects, setSubjects] = useState<string[]>([])
  const [subject, setSubject] = useState("")
  const [plan, setPlan] = useState<Plan | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const stop = useRef(false)

  useEffect(() => {
    let active = true
    setSubjects([])
    setSubject("")
    setPlan(null)
    setDrafts({})
    setLoading(true)
    pipeline("GET", { classLevel }).then((data) => {
      if (!active) return
      const list = Array.isArray(data.subjects) ? data.subjects as string[] : []
      setSubjects(list)
      setSubject(list[0] || "")
      setError("")
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not read NERDC subjects.") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [classLevel])

  useEffect(() => {
    if (!subject) return
    let active = true
    setPlan(null)
    setDrafts({})
    pipeline("GET", { classLevel, subject }).then((data) => {
      if (!active) return
      setPlan(data.plan || null)
      const record: Record<string, Draft> = {}
      for (const draft of data.drafts || []) if (draft?.title) record[draft.title] = draft
      setDrafts(record)
      setError("")
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not read saved drafts.") })
    return () => { active = false }
  }, [classLevel, subject])

  const findTopics = async () => {
    setLoading(true)
    setError("")
    setStatus("Reading NERDC and finding curriculum topics…")
    try {
      const data = await pipeline("POST", { action: "plan", classLevel, subject })
      setPlan(data.plan)
      setDrafts({})
      setStatus(`${data.plan.topics.length} topics found. Ready to write and review.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not find curriculum topics.")
    } finally { setLoading(false) }
  }

  const runTopics = async (titles: string[]) => {
    if (!plan || working) return
    stop.current = false
    setWorking(true)
    setError("")
    let published = 0
    let held = 0
    try {
      for (const title of titles) {
        if (stop.current) break
        let draft = drafts[title]
        if (draft?.status === "published") continue
        if (!draft || draft.status === "needs_revision") {
          setStatus(`Writing ${title}…`)
          const data = await pipeline("POST", { action: "write", classLevel, subject, topicTitle: title })
          draft = data.draft
          setDrafts((previous) => ({ ...previous, [title]: draft }))
        }
        setStatus(`AI reviewing ${title}…`)
        const data = await pipeline("POST", { action: "review", classLevel, subject, topicTitle: title })
        draft = data.draft
        setDrafts((previous) => ({ ...previous, [title]: draft }))
        if (draft.status === "published") published++
        else held++
      }
      setStatus(`${published} published after AI review · ${held} held for revision${stop.current ? " · stopped" : ""}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generation stopped.")
      setStatus(`${published} published · ${held} held. You can resume the remaining topics.`)
    } finally { setWorking(false) }
  }

  const remaining = plan?.topics.filter((topic) => drafts[topic.title]?.status !== "published").length || 0

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader eyebrow="Content" title="AI lesson generator" subtitle="Write lessons from the revised NERDC curriculum, then check each one with a separate AI reviewer." />

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="generator-class" className="field-label">Class</label>
          <select id="generator-class" className="select-premium mt-1.5" value={classLevel} disabled={working} onChange={(event) => setClassLevel(event.target.value)}>
            {CLASS_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="generator-subject" className="field-label">NERDC subject</label>
          <select id="generator-subject" className="select-premium mt-1.5" value={subject} disabled={loading || working || subjects.length === 0} onChange={(event) => setSubject(event.target.value)}>
            {subjects.length === 0 && <option value="">Loading subjects…</option>}
            {subjects.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="button" className="btn-secondary btn-sm" disabled={!subject || loading || working} onClick={() => void findTopics()}>
            <RefreshCw size={15} aria-hidden="true" /> Find current topics
          </button>
          {plan && (working ? (
            <button type="button" className="btn-secondary btn-sm" onClick={() => { stop.current = true }}>Stop after this lesson</button>
          ) : (
            <button type="button" className="btn-primary btn-sm" disabled={remaining === 0} onClick={() => void runTopics(plan.topics.map((topic) => topic.title))}>
              <Sparkles size={15} aria-hidden="true" /> Write and AI review {remaining} lesson{remaining === 1 ? "" : "s"}
            </button>
          ))}
        </div>
      </section>

      {loading && <p className="flex items-center gap-2 text-body-sm text-muted"><Loader2 size={16} className="animate-spin" /> Reading NERDC…</p>}
      {status && <p role="status" className="text-body-sm text-muted">{status}</p>}
      {error && <p role="alert" className="field-error">{error}</p>}

      {plan && (
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-h4 font-semibold text-foreground">{plan.topics.length} curriculum topics</h2>
              <a href={plan.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-caption text-accent underline">{plan.sourceTitle}</a>
            </div>
            <p className="text-caption text-muted">Published lessons are visible to students. Rejected drafts remain here for revision.</p>
          </div>
          <ol className="divide-y divide-hairline">
            {plan.topics.map((topic, index) => {
              const draft = drafts[topic.title]
              return (
                <li key={topic.title} className="py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <BookOpen size={17} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-semibold text-foreground">{index + 1}. {topic.title}</p>
                      <p className="mt-1 text-caption text-muted">{topic.term} · {topic.scope}</p>
                      <p className="mt-1 text-caption font-semibold text-muted">{draft?.status === "published" ? "Published after AI review" : draft?.status === "needs_revision" ? "Held for revision" : draft?.status === "awaiting_ai_review" ? "Awaiting AI review" : "Not written"}</p>
                    </div>
                    {draft?.status !== "published" && <button type="button" className="btn-secondary btn-sm" disabled={working} onClick={() => void runTopics([topic.title])}>{draft?.status === "needs_revision" ? "Revise and review" : "Write and review"}</button>}
                  </div>
                  {draft?.review?.issues?.length ? <ul className="ml-8 mt-2 list-disc text-caption text-warn">{draft.review.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
                  {draft?.content && <details className="ml-8 mt-2"><summary className="cursor-pointer text-caption text-accent">Read draft</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-sunken p-3 text-caption text-foreground">{draft.content}</pre></details>}
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </div>
  )
}
