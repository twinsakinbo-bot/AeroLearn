import { useState } from "react"
import { Check, ClipboardList, Plus, Trash2 } from "lucide-react"
import { newId, type DesktopProfile, type HomeworkItem } from "../storage"
import { classLevels } from "../data"
import { Page, PageHeading, Panel, EmptyState, relativeTime } from "../ui"
import type { Subject } from "../data"

const subjects: Subject[] = ["Mathematics", "English", "Physics", "Chemistry", "Biology", "Literature", "Government", "Economics"]

export function Homework({
  profile,
  update,
  showToast,
}: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  showToast: (text: string) => void
}) {
  const [title, setTitle] = useState("")
  const [subject, setSubject] = useState<Subject>("Mathematics")
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState("")
  const [filter, setFilter] = useState<"open" | "done" | "all">("open")

  const add = () => {
    if (!title.trim()) return
    const item: HomeworkItem = {
      id: newId("hw"),
      title: title.trim(),
      subject,
      dueDate,
      done: false,
      notes: notes.trim(),
    }
    update((current) => ({ ...current, homework: [item, ...current.homework] }), "Homework added")
    setTitle(""); setNotes("")
  }

  const toggle = (id: string) => {
    update((current) => ({
      ...current,
      homework: current.homework.map((item) =>
        item.id === id
          ? { ...item, done: !item.done }
          : item,
      ),
      coins: current.coins + (current.homework.find((item) => item.id === id && !item.done) ? 5 : 0),
      xp: current.xp + (current.homework.find((item) => item.id === id && !item.done) ? 15 : 0),
    }))
  }

  const remove = (id: string) => {
    update((current) => ({ ...current, homework: current.homework.filter((item) => item.id !== id) }), "Removed")
  }

  const visible = profile.homework.filter((item) => (filter === "all" ? true : filter === "done" ? item.done : !item.done))
  const openCount = profile.homework.filter((item) => !item.done).length

  return (
    <Page>
      <PageHeading
        overline="Stay on top"
        title="Homework"
        subtitle={`${openCount} open · ${profile.homework.length - openCount} done`}
      />
      <div className="content-grid">
        <Panel
          title="Assignments"
          description="Everything you owe, in one place."
          action={
            <div className="chip-row" style={{ marginTop: 0 }}>
              {(["open", "done", "all"] as const).map((key) => (
                <button key={key} className={filter === key ? "chip selected" : "chip"} onClick={() => setFilter(key)}>
                  {key === "open" ? "Open" : key === "done" ? "Done" : "All"}
                </button>
              ))}
            </div>
          }
        >
          {visible.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={filter === "done" ? "Nothing finished yet" : "No homework here"}
              body="Add an assignment on the right — it stays until you tick it off."
            />
          ) : (
            visible.map((item) => (
              <div key={item.id} className="hw-row">
                <button
                  className="row-action"
                  title={item.done ? "Mark undone" : "Mark done"}
                  onClick={() => toggle(item.id)}
                  style={item.done ? { background: "var(--mint-50)", color: "var(--mint)" } : undefined}
                >
                  <Check size={14} />
                </button>
                <div>
                  <strong style={item.done ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{item.title}</strong>
                  <span>{item.subject} · due {item.dueDate}{item.notes ? ` · ${item.notes}` : ""}</span>
                </div>
                <button className="icon-button" onClick={() => remove(item.id)}><Trash2 size={15} /></button>
              </div>
            ))
          )}
        </Panel>

        <Panel title="Add homework" description="Small tasks, tracked in one place.">
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Algebra worksheet" /></label>
          <label>Subject
            <select value={subject} onChange={(event) => setSubject(event.target.value as Subject)}>
              {subjects.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label>Notes (optional)<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Textbook pages 40–48" /></label>
          <button className="primary-button" onClick={add}><Plus size={14} /> Add homework</button>
        </Panel>
      </div>
      <div style={{ height: 18 }} />
      {profile.homework.some((item) => item.done) && (
        <Panel title="Recently completed" description="Nice work.">
          {profile.homework.filter((item) => item.done).slice(0, 6).map((item) => (
            <div className="hw-row" key={item.id}>
              <Check size={15} />
              <div>
                <strong>{item.title}</strong>
                <span>{item.subject} · finished {relativeTime(new Date().toISOString())}</span>
              </div>
            </div>
          ))}
        </Panel>
      )}
    </Page>
  )
}
