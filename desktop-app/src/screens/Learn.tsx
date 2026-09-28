import { useEffect, useMemo, useState } from "react"
import { BookOpen, Check, ChevronRight, CloudDownload, Cloud, HardDriveDownload, Library, RefreshCcw, Trash2, WifiOff } from "lucide-react"
import { awardStudy, easeWeakTopic, type DesktopProfile } from "../storage"
import { fetchLessons, downloadLesson, removeDownloaded, isDownloaded, colorFor, type RemoteLesson } from "../db"
import { Page, PageHeading, Panel, EmptyState } from "../ui"

type Source = "supabase" | "cache" | "demo"

export function Learn({
  profile,
  update,
  showToast,
}: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  showToast: (text: string) => void
}) {
  const [lessons, setLessons] = useState<RemoteLesson[]>([])
  const [source, setSource] = useState<Source>("demo")
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "downloaded" | "unfinished">("all")
  const [subject, setSubject] = useState<string>("All")
  const [selected, setSelected] = useState<RemoteLesson | null>(null)
  const [busyDownload, setBusyDownload] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetchLessons({ classLevel: profile.classLevel || undefined })
      .then(({ lessons, source }) => {
        setLessons(lessons)
        setSource(source)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [profile.classLevel])

  const subjects = useMemo(() => ["All", ...Array.from(new Set(lessons.map((lesson) => lesson.subject)))], [lessons])

  const filtered = useMemo(() => {
    return lessons.filter((lesson) => {
      if (subject !== "All" && lesson.subject !== subject) return false
      if (filter === "downloaded" && !isDownloaded(lesson.id)) return false
      if (filter === "unfinished" && profile.completedLessons.includes(lesson.id)) return false
      return true
    })
  }, [lessons, subject, filter, profile.completedLessons])

  const onDownload = async (lesson: RemoteLesson) => {
    setBusyDownload(lesson.id)
    try {
      const { questions } = await downloadLesson(lesson)
      showToast(questions > 0 ? `Saved for offline · ${questions} questions` : "Saved for offline")
    } finally {
      setBusyDownload(null)
    }
  }

  const onRemove = (lesson: RemoteLesson) => {
    removeDownloaded(lesson.id)
    showToast("Removed from device")
    if (filter === "downloaded") load()
    else setLessons((current) => [...current])
  }

  const openLesson = (lesson: RemoteLesson) => setSelected(lesson)
  const closeLesson = () => setSelected(null)

  const markComplete = (lesson: RemoteLesson) => {
    if (profile.completedLessons.includes(lesson.id)) return
    update((current) => {
      const seeded = awardStudy(current, { xp: 25, points: 10, coins: 5 })
      const eased = (lesson.examples || []).reduce(
        (acc, example) => easeWeakTopic(acc, lesson.subject as any, example.title || "General"),
        seeded,
      )
      return { ...eased, completedLessons: [...current.completedLessons, lesson.id] }
    }, "Lesson completed · +25 XP")
    setSelected(null)
  }

  if (selected) return <LessonDetail lesson={selected} onBack={closeLesson} onComplete={markComplete} isDone={profile.completedLessons.includes(selected.id)} />

  return (
    <Page>
      <PageHeading
        overline="Library"
        title="My lessons"
        subtitle="Learn at your pace. Download what you need for the ride home."
        aside={
          <>
            <span className="sync-status">
              <span className={source === "supabase" ? "" : "offline-dot"} />
              {source === "supabase" ? "Live from database" : source === "cache" ? "Offline · downloaded" : "Demo lessons"}
            </span>
            <button className="ghost-button" onClick={load} disabled={loading}>
              <RefreshCcw size={14} /> Refresh
            </button>
          </>
        }
      />

      <div className="chip-row">
        {(["all", "unfinished", "downloaded"] as const).map((key) => (
          <button
            key={key}
            className={filter === key ? "chip selected" : "chip"}
            onClick={() => setFilter(key)}
          >
            {key === "all" ? "All" : key === "unfinished" ? "Not started" : "Downloaded"}
          </button>
        ))}
        <span style={{ width: 12 }} />
        {subjects.map((option) => (
          <button
            key={option}
            className={subject === option ? "chip selected" : "chip"}
            onClick={() => setSubject(option)}
          >
            {option}
          </button>
        ))}
        <span style={{ marginLeft: "auto" }} className="chip mini">
          <Library size={12} /> {filtered.length} lessons
        </span>
      </div>

      <div style={{ height: 16 }} />

      {loading ? (
        <Panel>Loading lessons…</Panel>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={filter === "downloaded" ? HardDriveDownload : Library}
          title={filter === "downloaded" ? "Nothing downloaded yet" : "No lessons in this view"}
          body={
            filter === "downloaded"
              ? "Tap the download icon on any lesson to keep it on this device for offline study."
              : "Try a different subject or clear the filters."
          }
        />
      ) : (
        <div className="lesson-catalog">
          {filtered.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              done={profile.completedLessons.includes(lesson.id)}
              downloaded={isDownloaded(lesson.id)}
              busy={busyDownload === lesson.id}
              onOpen={() => openLesson(lesson)}
              onDownload={() => onDownload(lesson)}
              onRemove={() => onRemove(lesson)}
            />
          ))}
        </div>
      )}
    </Page>
  )
}

function LessonCard({
  lesson,
  done,
  downloaded,
  busy,
  onOpen,
  onDownload,
  onRemove,
}: {
  lesson: RemoteLesson
  done: boolean
  downloaded: boolean
  busy: boolean
  onOpen: () => void
  onDownload: () => void
  onRemove: () => void
}) {
  const color = colorFor(lesson.subject)
  return (
    <article className="lesson-card">
      <div className={`lesson-banner ${color}`}>
        <span>{lesson.subject}</span>
        <BookOpen size={26} />
      </div>
      <div className="lesson-card-body">
        <span className="overline">{lesson.classLevel || "Any class"} · {lesson.term || "—"}</span>
        <h2>{lesson.topicTitle}</h2>
        <p>{firstLine(lesson.content) || "Open to read the full lesson."}</p>
        <div className="lesson-footer">
          <span>{downloaded ? <span className="download-pill"><HardDriveDownload size={11} /> Offline</span> : <Cloud size={13} />}{done && <span className="completed-pill" style={{ marginLeft: 8 }}><Check size={11} /> Done</span>}</span>
          <div className="lesson-actions">
            {downloaded ? (
              <button className="icon-button" title="Remove download" onClick={onRemove}><Trash2 size={16} /></button>
            ) : (
              <button className="icon-button" title="Download for offline" onClick={onDownload} disabled={busy}>
                {busy ? <RefreshCcw size={16} /> : <CloudDownload size={16} />}
              </button>
            )}
            <button className="light-button" onClick={onOpen}>
              Open <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function LessonDetail({
  lesson,
  onBack,
  onComplete,
  isDone,
}: {
  lesson: RemoteLesson
  onBack: () => void
  onComplete: (lesson: RemoteLesson) => void
  isDone: boolean
}) {
  const color = colorFor(lesson.subject)
  const paragraphs = lesson.content.split(/\n\s*\n/).filter(Boolean)
  return (
    <Page>
      <button className="text-button" onClick={onBack}>← Back to library</button>
      <div style={{ height: 12 }} />
      <div className={`lesson-banner ${color}`} style={{ borderRadius: "var(--radius-lg)", padding: 28, height: "auto" }}>
        <div>
          <span style={{ background: "rgba(255,255,255,.7)" }}>{lesson.subject}</span>
          <h1 style={{ margin: "12px 0 4px", fontSize: 30, color: "inherit", letterSpacing: "-.03em" }}>{lesson.topicTitle}</h1>
          <p style={{ margin: 0, fontSize: 12, opacity: .75 }}>{lesson.classLevel} · {lesson.term}</p>
        </div>
        <BookOpen size={30} />
      </div>
      <div style={{ height: 22 }} />
      <div className="content-grid">
        <Panel title="Reading">
          {paragraphs.length ? (
            paragraphs.map((paragraph, index) => (
              <p key={index} style={{ margin: "0 0 14px", color: "var(--ink-soft)", fontSize: 14, lineHeight: 1.75 }}>
                {paragraph}
              </p>
            ))
          ) : (
            <p className="muted">This lesson has no reading yet.</p>
          )}
          <div style={{ height: 12 }} />
          {!isDone && (
            <button className="primary-button" onClick={() => onComplete(lesson)}>
              <Check size={16} /> Mark as complete
            </button>
          )}
          {isDone && <span className="completed-pill"><Check size={11} /> Completed</span>}
        </Panel>
        <div className="stacked">
          {lesson.examples && lesson.examples.length > 0 && (
            <Panel title="Worked examples">
              {lesson.examples.map((example, index) => (
                <div key={index} className="hw-row">
                  <BookOpen size={14} />
                  <div>
                    <strong>{example.title || `Example ${index + 1}`}</strong>
                    <span>{example.content}</span>
                  </div>
                </div>
              ))}
            </Panel>
          )}
          <Panel title="Study tips">
            <ul style={{ padding: "0 0 0 18px", margin: 0, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.7 }}>
              <li>Read once, then close and try to explain it back to yourself.</li>
              <li>Write one sentence in your notes on what stuck.</li>
              <li>Head to Practice — the questions here are calibrated to this lesson.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </Page>
  )
}

function firstLine(content: string) {
  const line = content.split(/\n/).find((line) => line.trim().length > 0) || ""
  return line.length > 120 ? line.slice(0, 118) + "…" : line
}
