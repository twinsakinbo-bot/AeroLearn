"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { collection, db, doc, getDocs, serverTimestamp, updateDoc } from "@/lib/db"
import {
  AlertTriangle,
  BookOpen,
  Check,
  ClipboardList,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Save,
  Trash2,
  Video,
} from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { auth } from "@/lib/auth"
import { termRank } from "@/lib/types/lesson"
import type { PracticeQuestion, QuestionOptions } from "@/lib/types/question"
import { cn } from "@/lib/utils"

/**
 * Lesson editor — the notes, the video and the homework for one lesson.
 *
 * Six real bugs fixed:
 *
 * 1. **Editing a question quietly corrupted the copy it was editing.**
 *    `const newHw = [...homework]` copies the array but not the objects in it, so
 *    `newHw[index].options[optKey] = value` mutated the same `options` object held
 *    by the lesson list — the version treated as "what is saved". Leaving without
 *    saving therefore looked as though the edit had been saved. Every update is
 *    immutable now, and the draft is a deep copy of the stored lesson.
 * 2. **Nothing could be edited except the video and the homework.** The notes are
 *    the lesson, and there was no field for them — an imported lesson with an
 *    empty body could only be fixed by rewriting the import file. The markdown
 *    body is editable here now, which is what the curriculum page's "No notes"
 *    warning points at.
 * 3. **Half-written homework saved without complaint.** A blank question with
 *    four blank options was a valid save, and students then opened a homework set
 *    with an empty question in it. Save is blocked until each question has text,
 *    four filled options and no two options identical.
 * 4. **A normal YouTube link produced a dead player.** The field asked for an
 *    `/embed/` URL, and pasting the `watch?v=` address every browser gives you
 *    saved a URL that renders as a grey box on the student page. `watch?v=` and
 *    `youtu.be` links are rewritten to the embed form, and anything that is not
 *    http(s) is refused — the student page drops this value straight into an
 *    `<iframe src>`.
 * 5. **Switching lessons in the dropdown threw away unsaved work** with no
 *    warning. The picker locks while there are unsaved changes, and closing the
 *    tab now asks first.
 * 6. **A failed load looked like a platform with no lessons.** `fetchLessons`
 *    logged to the console and left an empty dropdown; it also sorted on
 *    `a.classLevel.localeCompare`, which throws on a lesson saved without a
 *    class and took the whole list down with it. Fields are normalised on read,
 *    and a failed read is shown with a retry.
 *
 * Saving also writes `updatedAt`, which nothing did before, so the overview feed
 * can tell an edited lesson from a newly imported one.
 */

const LETTERS = ["A", "B", "C", "D"] as const
type Letter = (typeof LETTERS)[number]

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

type LessonRow = {
  id: string
  subject: string
  classLevel: string
  term: string
  topicTitle: string
  content: string
  videoUrl: string
  homework: PracticeQuestion[]
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function optionsFrom(value: unknown): QuestionOptions {
  const raw = (value ?? {}) as Partial<QuestionOptions>
  return { A: text(raw.A), B: text(raw.B), C: text(raw.C), D: text(raw.D) }
}

/** A deep-enough copy: the option map is the part that used to be shared. */
function cloneQuestion(question: PracticeQuestion): PracticeQuestion {
  return { ...question, options: { ...question.options } }
}

function questionFrom(value: unknown): PracticeQuestion {
  const raw = (value ?? {}) as Partial<PracticeQuestion>
  const answer = text(raw.correctAnswer).toUpperCase()
  return {
    ...raw,
    question: text(raw.question),
    options: optionsFrom(raw.options),
    correctAnswer: (LETTERS as readonly string[]).includes(answer) ? (answer as Letter) : "A",
    explanation: text(raw.explanation),
    exam: text(raw.exam) || "Homework",
    year: typeof raw.year === "number" ? raw.year : new Date().getFullYear(),
    subject: text(raw.subject),
  }
}

/**
 * The student lesson page puts `videoUrl` straight into an `<iframe src>`, so
 * only http(s) gets through, and the two forms an admin actually pastes are
 * rewritten to the embed URL they meant.
 */
function normaliseVideoUrl(raw: string): { url: string; problem: string | null } {
  const value = raw.trim()
  if (!value) return { url: "", problem: null }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { url: value, problem: "That is not a full address — it needs to start with https://." }
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { url: value, problem: "Only https links can be embedded in a lesson." }
  }

  const host = parsed.hostname.replace(/^(www|m)\./, "")
  if (host === "youtube.com") {
    const id = parsed.searchParams.get("v")
    if (id) return { url: `https://www.youtube.com/embed/${id}`, problem: null }
  }
  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0]
    if (id) return { url: `https://www.youtube.com/embed/${id}`, problem: null }
  }

  return { url: parsed.toString(), problem: null }
}

/** What still has to be fixed before homework can be saved, per question. */
function problemsIn(homework: PracticeQuestion[]): Map<number, string[]> {
  const found = new Map<number, string[]>()

  homework.forEach((question, index) => {
    const list: string[] = []
    if (!question.question.trim()) list.push("The question has no text.")

    const blank = LETTERS.filter((letter) => !question.options[letter].trim())
    if (blank.length > 0) {
      list.push(`Option ${blank.join(", ")} ${blank.length === 1 ? "is" : "are"} empty.`)
    }

    const filled = LETTERS.map((letter) => question.options[letter].trim().toLowerCase()).filter(Boolean)
    if (new Set(filled).size !== filled.length) list.push("Two options say the same thing.")

    if (list.length > 0) found.set(index, list)
  })

  return found
}

export default function AdminLessonEditorPage() {
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState("")
  const [notes, setNotes] = useState("")
  const [aiDraftContent, setAiDraftContent] = useState("")
  const [aiDraftSources, setAiDraftSources] = useState<Array<{ title: string; url: string }>>([])
  const [usingAiDraft, setUsingAiDraft] = useState(false)
  const [videoUrl, setVideoUrl] = useState("")
  const [videoQuery, setVideoQuery] = useState("")
  const [videoResults, setVideoResults] = useState<Array<{ id: string; title: string; channel: string; thumbnail: string; url: string }>>([])
  const [videoSearchUrl, setVideoSearchUrl] = useState("")
  const [videoSearchError, setVideoSearchError] = useState("")
  const [videoSearching, setVideoSearching] = useState(false)
  const [homework, setHomework] = useState<PracticeQuestion[]>([])

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const snap = await getDocs(collection(db, "lessons"))
      const rows = snap.docs.map<LessonRow>((entry) => {
        const data = entry.data()
        return {
          id: entry.id,
          subject: text(data.subject).trim() || "No subject",
          classLevel: text(data.classLevel).trim() || "No class",
          term: text(data.term).trim(),
          topicTitle: text(data.topicTitle).trim() || "Untitled topic",
          content: text(data.content),
          videoUrl: text(data.videoUrl).trim(),
          homework: Array.isArray(data.homework) ? data.homework.map(questionFrom) : [],
        }
      })
      rows.sort(
        (a, b) =>
          collator.compare(a.classLevel, b.classLevel) ||
          collator.compare(a.subject, b.subject) ||
          termRank(a.term) - termRank(b.term) ||
          collator.compare(a.topicTitle, b.topicTitle),
      )
      setLessons(rows)
    } catch (cause) {
      console.error("Failed to read the lesson bank:", cause)
      setError(cause instanceof Error ? cause.message : "The database did not respond.")
      setLessons([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /* The curriculum table links straight to a lesson: /admin/lesson-editor?lesson=id.
     Read once on mount rather than through useSearchParams, which would force this
     page into a Suspense boundary for a value that never changes. */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("lesson")
    if (wanted) setSelectedId(wanted)
  }, [])

  const selected = useMemo(
    () => lessons.find((lesson) => lesson.id === selectedId) ?? null,
    [lessons, selectedId],
  )

  useEffect(() => {
    setAiDraftContent("")
    setAiDraftSources([])
    if (!selectedId) return
    let active = true
    const readDraft = async () => {
      const user = auth.currentUser
      if (!user) return
      try {
        const token = await user.getIdToken()
        const response = await fetch(`/api/lessons/generate-draft?lessonId=${encodeURIComponent(selectedId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error("Could not load the AI draft.")
        const data = await response.json()
        if (active) {
          setAiDraftContent(typeof data.content === "string" ? data.content : "")
          setAiDraftSources(Array.isArray(data.sources) ? data.sources : [])
        }
      } catch (cause) {
        if (active) setSaveError(cause instanceof Error ? cause.message : "Could not load the AI draft.")
      }
    }
    void readDraft()
    return () => { active = false }
  }, [selectedId])

  /* Fill the draft from whichever lesson is selected. Re-running when `lessons`
     changes is what resets the form after a save. */
  useEffect(() => {
    if (!selected) return
    setNotes(selected.content)
    setUsingAiDraft(false)
    setVideoUrl(selected.videoUrl)
    setVideoQuery(`${selected.topicTitle} ${selected.subject} ${selected.classLevel} lesson`)
    setVideoResults([])
    setVideoSearchUrl("")
    setVideoSearchError("")
    setHomework(selected.homework.map(cloneQuestion))
    setSaveError(null)
  }, [selected])

  const problems = useMemo(() => problemsIn(homework), [homework])

  const dirty = useMemo(() => {
    if (!selected) return false
    return (
      notes !== selected.content ||
      videoUrl !== selected.videoUrl ||
      JSON.stringify(homework) !== JSON.stringify(selected.homework)
    )
  }, [selected, notes, videoUrl, homework])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(timer)
  }, [saved])

  const patchQuestion = (index: number, patch: Partial<PracticeQuestion>) =>
    setHomework((prev) => prev.map((question, i) => (i === index ? { ...question, ...patch } : question)))

  const patchOption = (index: number, letter: Letter, value: string) =>
    setHomework((prev) =>
      prev.map((question, i) =>
        i === index ? { ...question, options: { ...question.options, [letter]: value } } : question,
      ),
    )

  const addQuestion = () =>
    setHomework((prev) => [
      ...prev,
      {
        question: "",
        options: { A: "", B: "", C: "", D: "" },
        correctAnswer: "A",
        explanation: "",
        exam: "Homework",
        year: new Date().getFullYear(),
        subject: selected?.subject ?? "",
      },
    ])

  const removeQuestion = (index: number) =>
    setHomework((prev) => prev.filter((_, i) => i !== index))

  const discard = () => {
    if (!selected) return
    setNotes(selected.content)
    setUsingAiDraft(false)
    setVideoUrl(selected.videoUrl)
    setHomework(selected.homework.map(cloneQuestion))
    setSaveError(null)
  }

  const save = async () => {
    if (!selected) return

    if (problems.size > 0) {
      setSaveError(
        `${problems.size} homework question${problems.size === 1 ? "" : "s"} still ${
          problems.size === 1 ? "needs" : "need"
        } fixing — see the notes in red below.`,
      )
      return
    }

    const video = normaliseVideoUrl(videoUrl)
    if (video.problem) {
      setSaveError(video.problem)
      return
    }

    const cleaned = homework.map((question) => ({
      ...question,
      question: question.question.trim(),
      options: {
        A: question.options.A.trim(),
        B: question.options.B.trim(),
        C: question.options.C.trim(),
        D: question.options.D.trim(),
      },
      explanation: (question.explanation ?? "").trim(),
      subject: question.subject || selected.subject,
    }))

    setSaving(true)
    setSaveError(null)
    try {
      await updateDoc(doc(db, "lessons", selected.id), {
        content: notes,
        videoUrl: video.url,
        homework: cleaned,
        updatedAt: serverTimestamp(),
      })
      if (usingAiDraft) {
        const token = await auth.currentUser?.getIdToken()
        const response = await fetch(`/api/lessons/generate-draft?lessonId=${encodeURIComponent(selected.id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) throw new Error("Notes saved, but the AI draft could not be cleared. Reload and try again.")
        setAiDraftContent("")
        setAiDraftSources([])
      }
      setLessons((prev) =>
        prev.map((lesson) =>
          lesson.id === selected.id
            ? { ...lesson, content: notes, videoUrl: video.url, homework: cleaned.map(cloneQuestion) }
            : lesson,
        ),
      )
      setSaved(true)
    } catch (cause) {
      console.error("Failed to save the lesson:", cause)
      setSaveError(cause instanceof Error ? cause.message : "The lesson could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const searchVideos = async () => {
    if (!auth.currentUser || videoQuery.trim().length < 3) {
      setVideoSearchError("Enter a topic and sign in before searching.")
      return
    }
    setVideoSearching(true)
    setVideoSearchError("")
    setVideoResults([])
    try {
      const token = await auth.currentUser.getIdToken()
      const response = await fetch(`/api/lessons/video-search?q=${encodeURIComponent(videoQuery.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Video search failed.")
      setVideoResults(Array.isArray(data.results) ? data.results : [])
      setVideoSearchUrl(data.searchUrl || "")
      if (data.needsApiKey) setVideoSearchError("In-app suggestions need a YouTube API key. Open the search below and paste a video link.")
      else if (data.error) setVideoSearchError(data.error)
      else if (!data.results?.length) setVideoSearchError("No embeddable videos found. Try a different search.")
    } catch (cause) {
      setVideoSearchError(cause instanceof Error ? cause.message : "Video search failed.")
    } finally { setVideoSearching(false) }
  }

  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0
  const video = normaliseVideoUrl(videoUrl)

  /* Grouped so a dropdown of a whole platform's lessons is navigable. */
  const grouped = useMemo(() => {
    const map = new Map<string, LessonRow[]>()
    lessons.forEach((lesson) => {
      const bucket = map.get(lesson.classLevel)
      if (bucket) bucket.push(lesson)
      else map.set(lesson.classLevel, [lesson])
    })
    return Array.from(map.entries())
  }, [lessons])

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Content"
        title="Lesson editor"
        subtitle="Write the notes, attach a video, and set the homework for one lesson."
        actions={
          <>
            <button type="button" onClick={() => void load()} disabled={loading || dirty} className="btn-secondary btn-sm">
              <RefreshCw size={15} className={cn(loading && "animate-spin")} aria-hidden="true" />
              {loading ? "Loading…" : "Reload"}
            </button>
            <Link href="/admin/curriculum" className="btn-secondary btn-sm">
              <BookOpen size={15} aria-hidden="true" />
              Curriculum
            </Link>
          </>
        }
      />

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold text-foreground">Could not read the lesson bank</p>
            <p className="mt-0.5 break-words text-caption text-muted">{error}</p>
          </div>
          <button type="button" onClick={() => void load()} className="btn-secondary btn-sm shrink-0">
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="card p-12">
          <LoadingState text="Reading the lesson bank…" />
        </div>
      ) : lessons.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No lessons to edit yet"
          description="Import a syllabus file first — the editor works on lessons that already exist."
          actionText="Import lessons"
          actionHref="/admin/lesson-importer"
        />
      ) : (
        <>
          <div className="card p-5">
            <label htmlFor="lesson-picker" className="field-label">
              Lesson
            </label>
            <select
              id="lesson-picker"
              value={selectedId}
              disabled={dirty}
              onChange={(event) => setSelectedId(event.target.value)}
              className="select-premium"
            >
              <option value="">Choose a lesson…</option>
              {grouped.map(([classLevel, group]) => (
                <optgroup key={classLevel} label={classLevel}>
                  {group.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.subject} · {lesson.term || "No term"} · {lesson.topicTitle}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="field-hint">
              {dirty
                ? "Save or discard your changes before switching to another lesson."
                : `${lessons.length.toLocaleString()} lesson${lessons.length === 1 ? "" : "s"} in the bank.`}
            </p>
          </div>

          {selectedId && !selected ? (
            <div className="mt-6">
              <EmptyState
                icon={AlertTriangle}
                title="That lesson is no longer there"
                description="The link pointed at a lesson id that is not in the bank any more — it was probably deleted. Pick another one above."
              />
            </div>
          ) : !selected ? (
            <div className="mt-6">
              <EmptyState
                icon={FileText}
                title="Pick a lesson to edit"
                description="Choose one above, or open the curriculum table and use the pencil next to the lesson you want."
                actionText="Browse the curriculum"
                actionHref="/admin/curriculum"
              />
            </div>
          ) : (
            <div className="mt-6 space-y-6 pb-28">
              <p className="text-caption text-subtle">
                Editing <span className="font-semibold text-foreground">{selected.topicTitle}</span> ·{" "}
                {selected.subject} · {selected.classLevel}
                {selected.term ? ` · ${selected.term}` : ""}
              </p>

              <section className="card p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3 border-b border-hairline pb-4">
                  <h2 className="flex items-center gap-2 text-h4 font-semibold text-foreground">
                    <FileText size={18} className="text-accent" aria-hidden="true" />
                    Notes
                  </h2>
                  <span
                    className={cn(
                      "text-caption tabular-nums",
                      words === 0 ? "font-semibold text-warn" : "text-subtle",
                    )}
                  >
                    {words === 0 ? "Empty" : `${words.toLocaleString()} words`}
                  </span>
                </div>

                {aiDraftContent && (
                  <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
                    <p className="text-body-sm font-semibold text-foreground">AI draft ready for review</p>
                    <p className="mt-1 text-caption text-muted">Read and correct the generated note before saving it for students.</p>
                    {aiDraftSources.length > 0 && (
                      <div className="mt-3 text-caption text-muted">
                        <p className="font-semibold">Curriculum sources checked:</p>
                        <ul className="mt-1 list-disc pl-5">
                          {aiDraftSources.map((source) => (
                            <li key={source.url}><a className="text-accent underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn-secondary btn-sm mt-3"
                      disabled={dirty && !usingAiDraft}
                      onClick={() => { setNotes(aiDraftContent); setUsingAiDraft(true) }}
                    >
                      Load draft into editor
                    </button>
                  </div>
                )}

                <label htmlFor="lesson-notes" className="field-label">
                  Lesson body
                </label>
                <textarea
                  id="lesson-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  spellCheck
                  placeholder={"## Introduction\n\nWrite the lesson here. Markdown works: **bold**, lists, and ## headings."}
                  className="input-premium min-h-[22rem] font-mono text-body-sm leading-relaxed"
                />
                <p className="field-hint">
                  Markdown. Students read this on the lesson page — headings break it into sections they can
                  scan.
                </p>
              </section>

              <section className="card p-5 sm:p-6">
                <div className="mb-4 border-b border-hairline pb-4">
                  <h2 className="flex items-center gap-2 text-h4 font-semibold text-foreground">
                    <Video size={18} className="text-accent" aria-hidden="true" />
                    Video
                  </h2>
                </div>

                <label htmlFor="video-search" className="field-label">Find a lesson video</label>
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input id="video-search" className="input-premium flex-1" value={videoQuery} onChange={(event) => setVideoQuery(event.target.value)} placeholder="Search by topic and subject" />
                  <button type="button" className="btn-secondary shrink-0" disabled={videoSearching || videoQuery.trim().length < 3} onClick={() => void searchVideos()}>
                    <Search size={16} aria-hidden="true" /> {videoSearching ? "Searching…" : "Find videos"}
                  </button>
                </div>
                {videoSearchError && <p role="status" className="mt-2 text-caption text-muted">{videoSearchError}</p>}
                {videoSearchUrl && <a href={videoSearchUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-caption font-semibold text-accent underline">Open this search on YouTube</a>}
                {videoResults.length > 0 && (
                  <ul className="my-4 grid gap-2 sm:grid-cols-2">
                    {videoResults.map((result) => (
                      <li key={result.id} className="flex gap-3 rounded-lg border border-hairline p-2">
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-accent/10 text-accent"><Video size={22} aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-caption font-semibold text-foreground">{result.title}</p>
                          <p className="truncate text-caption text-muted">{result.channel}</p>
                          <button type="button" className="mt-1 text-caption font-semibold text-accent underline" onClick={() => setVideoUrl(result.url)}>Use this video</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <label htmlFor="lesson-video" className="field-label">
                  YouTube or Vimeo link
                </label>
                <input
                  id="lesson-video"
                  type="url"
                  inputMode="url"
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  onBlur={() => setVideoUrl(video.problem ? videoUrl : video.url)}
                  aria-invalid={video.problem ? "true" : undefined}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="input-premium"
                />
                {video.problem ? (
                  <p role="alert" className="field-error">
                    <AlertTriangle size={13} aria-hidden="true" />
                    {video.problem}
                  </p>
                ) : (
                  <p className="field-hint">
                    Paste the ordinary watch link — it is converted to the embed form on save. Leave it empty
                    for a lesson with no video.
                  </p>
                )}

                {!video.problem && video.url && (
                  <div className="mt-5">
                    <p className="eyebrow mb-2">Preview</p>
                    <div className="relative aspect-video w-full max-w-xl overflow-hidden rounded-xl border border-hairline bg-ink-950">
                      <iframe
                        src={video.url}
                        title="Video preview"
                        className="absolute inset-0 h-full w-full"
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className="card p-5 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
                  <h2 className="flex items-center gap-2 text-h4 font-semibold text-foreground">
                    <ClipboardList size={18} className="text-accent" aria-hidden="true" />
                    Homework
                  </h2>
                  <span className="flex items-center gap-2">
                    {problems.size > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-caption font-semibold text-danger">
                        <AlertTriangle size={13} aria-hidden="true" />
                        {problems.size} to fix
                      </span>
                    )}
                    <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-caption font-semibold text-subtle">
                      {homework.length} question{homework.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </div>

                {homework.length === 0 ? (
                  <p className="text-body-sm text-muted">
                    No homework on this lesson yet. Students see the homework tab as empty until there is at
                    least one question here.
                  </p>
                ) : (
                  <ol className="space-y-5">
                    {homework.map((question, index) => (
                      <li key={index} className="rounded-xl border border-hairline bg-surface-sunken p-4 sm:p-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-body-sm font-bold text-foreground">Question {index + 1}</p>
                          <button
                            type="button"
                            onClick={() => removeQuestion(index)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 size={15} aria-hidden="true" />
                            <span className="sr-only">Remove question {index + 1}</span>
                          </button>
                        </div>

                        <label htmlFor={`hw-${index}-text`} className="sr-only">
                          Question {index + 1} text
                        </label>
                        <textarea
                          id={`hw-${index}-text`}
                          value={question.question}
                          onChange={(event) => patchQuestion(index, { question: event.target.value })}
                          placeholder="What is the question?"
                          className="input-premium min-h-[5rem]"
                        />

                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {LETTERS.map((letter) => (
                            <div key={letter} className="flex items-center gap-2">
                              <label className="shrink-0 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`hw-${index}-correct`}
                                  value={letter}
                                  checked={question.correctAnswer === letter}
                                  onChange={() => patchQuestion(index, { correctAnswer: letter })}
                                  className="peer sr-only"
                                />
                                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-surface text-caption font-bold text-muted transition-colors peer-checked:border-success peer-checked:bg-success/10 peer-checked:text-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                                  {letter}
                                </span>
                                <span className="sr-only">Mark option {letter} as the correct answer</span>
                              </label>
                              <label htmlFor={`hw-${index}-option-${letter}`} className="sr-only">
                                Option {letter}
                              </label>
                              <input
                                id={`hw-${index}-option-${letter}`}
                                type="text"
                                value={question.options[letter]}
                                onChange={(event) => patchOption(index, letter, event.target.value)}
                                placeholder={`Option ${letter}`}
                                className="input-premium py-2"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="mt-4">
                          <label htmlFor={`hw-${index}-why`} className="field-label">
                            Why that answer is right
                          </label>
                          <input
                            id={`hw-${index}-why`}
                            type="text"
                            value={question.explanation ?? ""}
                            onChange={(event) => patchQuestion(index, { explanation: event.target.value })}
                            placeholder="Shown after the student answers. Optional, but it is where the learning happens."
                            className="input-premium"
                          />
                        </div>

                        {problems.get(index) && (
                          <ul role="alert" className="mt-3 space-y-1">
                            {problems.get(index)?.map((problem) => (
                              <li key={problem} className="flex items-center gap-1.5 text-caption font-medium text-danger">
                                <AlertTriangle size={13} className="shrink-0" aria-hidden="true" />
                                {problem}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                )}

                <button
                  type="button"
                  onClick={addQuestion}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline py-3 text-body-sm font-semibold text-muted transition-colors hover:border-accent/40 hover:bg-accent/[0.04] hover:text-accent"
                >
                  <Plus size={16} aria-hidden="true" />
                  Add a question
                </button>
              </section>

              <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface/85 p-3 shadow-lg backdrop-blur-xl">
                {saveError ? (
                  <p role="alert" className="flex min-w-0 items-center gap-1.5 pl-1 text-caption font-semibold text-danger">
                    <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
                    {saveError}
                  </p>
                ) : (
                  <p role="status" className="pl-1 text-caption">
                    {saved ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-success">
                        <Check size={14} aria-hidden="true" />
                        Saved
                      </span>
                    ) : dirty ? (
                      <span className="font-semibold text-warn">Unsaved changes</span>
                    ) : (
                      <span className="text-subtle">Everything here is saved</span>
                    )}
                  </p>
                )}

                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={discard}
                    disabled={!dirty || saving}
                    className="btn-secondary btn-sm"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={!dirty || saving}
                    className="btn-primary btn-sm"
                  >
                    {saving ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" aria-hidden="true" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save size={15} aria-hidden="true" />
                        Save changes
                      </>
                    )}
                  </button>
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
