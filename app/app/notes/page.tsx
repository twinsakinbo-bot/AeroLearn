"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { collection, db, doc, getDoc, getDocs, query, where } from "@/lib/db"
import { BookOpen, ChevronRight, FileText, Search } from "lucide-react"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkMath from "remark-math"
import "katex/dist/katex.min.css"

import { AI_FALLBACK_LINE, LibraryPendingNotice } from "@/components/ui/availability"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import type { Note, NoteBlock } from "@/lib/types/note"
import { cn } from "@/lib/utils"

/**
 * Published notes for the student's class.
 *
 * Every note is fetched once and then filtered in memory. The previous version
 * ran a second query per subject and counted notes from that partial result, so
 * the subject list always claimed "0 notes"; one query fixes the count and
 * removes the round trip. Notes are also readable now — the blocks stored on
 * each document are rendered here rather than behind a "Read" button that had
 * no handler.
 */

type StoredNote = Omit<Note, "content"> & { id: string; content: NoteBlock[] | string; videoUrl?: string }

/** Presentation for each block type a note can contain. */
const CALLOUTS: Partial<Record<NoteBlock["type"], { label: string; className: string }>> = {
  example: { label: "Example", className: "border-accent/25 bg-accent/[0.06]" },
  tip: { label: "Tip", className: "border-success/25 bg-success/[0.06]" },
  summary: { label: "In short", className: "border-hairline bg-surface-sunken" },
}

const HEADING_SIZES: Record<number, string> = {
  1: "text-h3",
  2: "text-h4",
  3: "text-body-lg",
}

/** One stored block. Unknown types fall through to a plain paragraph. */
function Block({ block }: { block: NoteBlock }) {
  const text = block.content ?? ""

  switch (block.type) {
    case "heading": {
      const size = HEADING_SIZES[block.level ?? 2] ?? "text-h4"
      return <h3 className={cn("mt-7 font-semibold text-foreground first:mt-0", size)}>{text}</h3>
    }

    case "list":
      return (
        <ul className="ml-5 list-disc space-y-1.5 text-body text-muted">
          {text
            .split("\n")
            .map((line) => line.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean)
            .map((line, index) => (
              <li key={index}>{line}</li>
            ))}
        </ul>
      )

    case "formula":
      return (
        <p className="overflow-x-auto rounded-lg border border-hairline bg-surface-sunken px-4 py-3 text-center font-mono text-body-sm text-foreground">
          {text}
        </p>
      )

    case "example":
    case "tip":
    case "summary": {
      const callout = CALLOUTS[block.type]!
      return (
        <div className={cn("rounded-lg border p-4", callout.className)}>
          <p className="mb-1.5 text-overline uppercase text-subtle">{callout.label}</p>
          <p className="whitespace-pre-line text-body-sm text-foreground">{text}</p>
        </div>
      )
    }

    default:
      return <p className="whitespace-pre-line text-body text-muted">{text}</p>
  }
}

/** Row in the subject list and in search results. */
function NoteRow({ note, onOpen }: { note: StoredNote; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-3.5 text-left transition-colors hover:border-accent/30 hover:bg-surface-hover"
    >
      <FileText size={17} className="shrink-0 text-subtle" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-semibold text-foreground">
          {note.title}
        </span>
        <span className="block truncate text-caption text-muted">
          {[note.topic, note.subject].filter(Boolean).join(" · ")}
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-subtle" aria-hidden="true" />
    </button>
  )
}

export default function NotesPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState<string | null>(null)
  const [openNote, setOpenNote] = useState<StoredNote | null>(null)
  const [search, setSearch] = useState("")

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

        if (data?.classLevel) {
          const [published, lessons] = await Promise.all([
            getDocs(query(collection(db, "notes"), where("classLevel", "==", data.classLevel), where("isPublished", "==", true))),
            getDocs(query(collection(db, "lessons"), where("classLevel", "==", data.classLevel))),
          ])
          const writtenLessons = lessons.docs.flatMap((entry) => {
            const lesson = entry.data()
            const content = typeof lesson.content === "string" ? lesson.content.trim() : ""
            if (!content || content.includes("This is a comprehensive overview of")) return []
            return [{
              id: `lesson-${entry.id}`,
              classLevel: String(lesson.classLevel || ""),
              subject: String(lesson.subject || ""),
              topic: String(lesson.topicTitle || ""),
              title: String(lesson.topicTitle || "Lesson notes"),
              content,
              videoUrl: typeof lesson.videoUrl === "string" ? lesson.videoUrl : "",
              isPublished: true,
            } satisfies StoredNote]
          })
          setNotes([...published.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as StoredNote), ...writtenLessons])
        }
      } catch (err) {
        console.error("Failed to load notes:", err)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [router])

  const subjects = useMemo(
    () => notes.length > 0
      ? Array.from(new Set(notes.map((note) => note.subject)))
      : (Array.isArray(profile?.subjects) ? (profile!.subjects as string[]) : []),
    [profile, notes],
  )

  const countBySubject = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const note of notes) counts[note.subject] = (counts[note.subject] || 0) + 1
    return counts
  }, [notes])

  const term = search.trim().toLowerCase()
  const matches = useMemo(() => {
    if (term.length < 2) return []
    return notes.filter((note) =>
      [note.title, note.topic, note.subject].some((field) =>
        (field || "").toLowerCase().includes(term),
      ),
    )
  }, [notes, term])

  if (loading) return <LoadingState full text="Loading your notes…" />

  if (!profile?.onboardingCompleted) {
    return (
      <>
        <PageHeader title="Notes" subtitle="Written notes for your class." />
        <EmptyState
          icon={BookOpen}
          title="Finish setting up first"
          description="Notes are matched to your class and subjects, so we need those answers first."
          actionText="Complete setup"
          actionHref="/onboarding"
        />
      </>
    )
  }

  /* ── Reader ──────────────────────────────────────────────────────────── */
  if (openNote) {
    const blocks = Array.isArray(openNote.content) ? openNote.content : []
    const markdown = typeof openNote.content === "string" ? openNote.content : ""

    return (
      <article className="mx-auto max-w-prose">
        <PageHeader
          onBack={() => setOpenNote(null)}
          backLabel={`Back to ${openNote.subject}`}
          eyebrow={openNote.topic}
          title={openNote.title}
          subtitle={`${openNote.subject} · ${openNote.classLevel}`}
        />

        {markdown ? (
          <div className="prose max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-muted prose-li:text-muted">
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{markdown}</ReactMarkdown>
          </div>
        ) : blocks.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="This note is empty"
            description="Nothing has been written into it yet. Try another note in this topic."
          />
        ) : (
          <div className="space-y-4">
            {blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </div>
        )}
        {openNote.videoUrl && /^https:\/\/(?:www\.youtube\.com\/embed\/[a-zA-Z0-9_-]{11}|player\.vimeo\.com\/video\/\d+)/.test(openNote.videoUrl) && (
          <section className="mt-7">
            <h2 className="mb-3 text-h4 font-semibold text-foreground">Watch the lesson</h2>
            <div className="relative aspect-video overflow-hidden rounded-xl border border-hairline bg-ink-950">
              <iframe src={openNote.videoUrl} title={`Video for ${openNote.title}`} className="absolute inset-0 h-full w-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          </section>
        )}
      </article>
    )
  }

  /* ── One subject ─────────────────────────────────────────────────────── */
  if (subject) {
    const forSubject = notes.filter((note) => note.subject === subject)
    const topics = Array.from(new Set(forSubject.map((note) => note.topic || "Other")))

    return (
      <>
        <PageHeader
          onBack={() => setSubject(null)}
          backLabel="All subjects"
          eyebrow={String(profile?.classLevel ?? "")}
          title={subject}
          subtitle={
            forSubject.length === 0
              ? undefined
              : `${forSubject.length} ${forSubject.length === 1 ? "note" : "notes"} across ${topics.length} ${topics.length === 1 ? "topic" : "topics"}.`
          }
        />

        {forSubject.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={`No ${subject} notes yet`}
            description={`No ${subject} notes have been published for your class yet. ${AI_FALLBACK_LINE}`}
            actionText={`Practise ${subject}`}
            actionHref={`/app/practice?subject=${encodeURIComponent(subject)}`}
          />
        ) : (
          <div className="space-y-8">
            {topics.map((topic) => (
              <section key={topic}>
                <h2 className="mb-3 text-overline uppercase text-subtle">{topic}</h2>
                <div className="space-y-2">
                  {forSubject
                    .filter((note) => (note.topic || "Other") === topic)
                    .map((note) => (
                      <NoteRow key={note.id} note={note} onOpen={() => setOpenNote(note)} />
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </>
    )
  }

  /* ── Subject index ───────────────────────────────────────────────────── */
  return (
    <>
      <PageHeader
        eyebrow="Library"
        title="Notes"
        subtitle={`Written notes published for ${profile?.classLevel ? String(profile.classLevel) : "your class"}.`}
      />

      {notes.length === 0 && subjects.length > 0 && (
        <LibraryPendingNotice
          className="mb-6"
          title="No notes for your class yet"
          detail={`No written notes have been published for ${
            profile?.classLevel ? String(profile.classLevel) : "your class"
          } yet, so every subject below reads zero. ${AI_FALLBACK_LINE}`}
        />
      )}

      <div className="relative mb-6">
        <Search
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        />
        <label htmlFor="note-search" className="sr-only">
          Search notes
        </label>
        <input
          id="note-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by title or topic"
          className="input-premium pl-10"
        />
      </div>

      {term.length >= 2 ? (
        matches.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nothing matched"
            description={`No note title, topic or subject contains “${search.trim()}”.`}
          />
        ) : (
          <div className="space-y-2">
            <p className="mb-3 text-caption text-muted">
              {matches.length} {matches.length === 1 ? "match" : "matches"}
            </p>
            {matches.map((note) => (
              <NoteRow key={note.id} note={note} onOpen={() => setOpenNote(note)} />
            ))}
          </div>
        )
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects chosen"
          description="Pick the subjects you are studying and your notes will be organised by them."
          actionText="Choose subjects"
          actionHref="/app/settings"
        />
      ) : (
        <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
          {subjects.map((name) => {
            const count = countBySubject[name] || 0
            return (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => setSubject(name)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="min-w-0 truncate text-body-sm font-semibold text-foreground">
                    {name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    <span
                      className={cn(
                        "text-caption",
                        count === 0 ? "text-subtle" : "font-semibold text-muted",
                      )}
                    >
                      {count === 0 ? "None yet" : `${count} ${count === 1 ? "note" : "notes"}`}
                    </span>
                    <ChevronRight size={16} className="text-subtle" aria-hidden="true" />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
