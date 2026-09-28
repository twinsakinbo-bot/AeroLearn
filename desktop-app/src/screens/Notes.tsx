import { useEffect, useState } from "react"
import { NotebookPen, Plus, Trash2 } from "lucide-react"
import { newId, type DesktopProfile, type NoteItem } from "../storage"
import { Page, PageHeading, Panel, EmptyState, relativeTime } from "../ui"
import type { Subject } from "../data"

const subjects: Subject[] = ["Mathematics", "English", "Physics", "Chemistry", "Biology", "Literature", "Government", "Economics"]

export function Notes({
  profile,
  update,
  showToast,
}: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  showToast: (text: string) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(profile.notes[0]?.id || null)
  const active = profile.notes.find((note) => note.id === activeId) || null
  const [title, setTitle] = useState(active?.title || "")
  const [body, setBody] = useState(active?.body || "")
  const [subject, setSubject] = useState<Subject>((active?.subject as Subject) || "English")

  useEffect(() => {
    if (active) { setTitle(active.title); setBody(active.body); setSubject(active.subject as Subject) }
  }, [activeId])

  const save = () => {
    if (!active) return
    update((current) => ({
      ...current,
      notes: current.notes.map((note) => (note.id === active.id ? { ...note, title: title.trim() || "Untitled", body, subject, updatedAt: new Date().toISOString() } : note)),
    }), "Saved")
  }

  const addNote = () => {
    const note: NoteItem = {
      id: newId("note"),
      title: "New note",
      body: "",
      subject: "English",
      updatedAt: new Date().toISOString(),
    }
    update((current) => ({ ...current, notes: [note, ...current.notes] }), "New note")
    setActiveId(note.id)
  }

  const remove = (id: string) => {
    update((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== id) }), "Deleted")
    if (id === activeId) setActiveId(profile.notes.find((note) => note.id !== id)?.id || null)
  }

  return (
    <Page>
      <PageHeading
        overline="Your notebook"
        title="Notes"
        subtitle="Everything stays on this device."
        aside={<button className="primary-button" onClick={addNote}><Plus size={14} /> New note</button>}
      />
      {profile.notes.length === 0 ? (
        <EmptyState icon={NotebookPen} title="No notes yet" body="Start with a fresh page — a good note is one sentence you'll remember tomorrow." action={<button className="primary-button" onClick={addNote}><Plus size={14} /> New note</button>} />
      ) : (
        <div className="notes-layout">
          <div className="notes-list">
            {profile.notes.map((note) => (
              <button key={note.id} className={activeId === note.id ? "note-item active" : "note-item"} onClick={() => setActiveId(note.id)}>
                <strong>{note.title || "Untitled"}</strong>
                <small>{note.subject} · {relativeTime(note.updatedAt)}</small>
                <p>{note.body.slice(0, 120) || "Empty note"}</p>
              </button>
            ))}
          </div>
          {active && (
            <Panel className="note-editor">
              <input
                className="note-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
              />
              <div className="chip-row" style={{ marginTop: 4 }}>
                {subjects.map((option) => (
                  <button
                    key={option}
                    className={subject === option ? "chip selected" : "chip"}
                    onClick={() => setSubject(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Start typing…"
              />
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button className="primary-button" onClick={save}>Save</button>
                <button className="danger-button" onClick={() => remove(active.id)}><Trash2 size={14} /> Delete</button>
              </div>
            </Panel>
          )}
        </div>
      )}
    </Page>
  )
}
