import { useState } from "react"
import { Calendar, Plus, Trash2 } from "lucide-react"
import { dayOrder } from "../data"
import type { Subject } from "../data"
import { newId, type DesktopProfile, type TimetableSlot } from "../storage"
import { Page, PageHeading, Panel, EmptyState } from "../ui"
import { colorFor } from "../db"

const subjects: Subject[] = ["Mathematics", "English", "Physics", "Chemistry", "Biology", "Literature", "Government", "Economics"]
const hours = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"]

export function Timetable({
  profile,
  update,
  showToast,
}: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  showToast: (text: string) => void
}) {
  const [day, setDay] = useState(dayOrder[0])
  const [start, setStart] = useState("16:00")
  const [subject, setSubject] = useState<Subject>("Mathematics")
  const [note, setNote] = useState("")

  const add = () => {
    const slot: TimetableSlot = { id: newId("slot"), day, start, subject, note: note.trim() }
    update((current) => ({ ...current, timetable: [...current.timetable, slot] }), "Slot added")
    setNote("")
  }

  const remove = (id: string) => {
    update((current) => ({ ...current, timetable: current.timetable.filter((slot) => slot.id !== id) }), "Slot removed")
  }

  const grid: Record<string, Record<string, TimetableSlot[]>> = {}
  hours.forEach((hour) => { grid[hour] = {}; dayOrder.forEach((d) => { grid[hour][d] = [] }) })
  profile.timetable.forEach((slot) => {
    const bucket = hours.find((hour) => hour === slot.start) || hours[0]
    if (grid[bucket]) grid[bucket][slot.day] = [...(grid[bucket][slot.day] || []), slot]
  })

  return (
    <Page>
      <PageHeading overline="Your rhythm" title="Timetable" subtitle="A weekly plan you actually keep." />
      <div className="timetable-layout">
        <Panel>
          {profile.timetable.length === 0 ? (
            <EmptyState icon={Calendar} title="Your week is open" body="Add a study slot on the right — even one a day builds a rhythm." />
          ) : (
            <div className="timetable-week">
              <div />
              {dayOrder.map((d) => <div className="tt-head" key={d}>{d}</div>)}
              {hours.map((hour) => (
                <>
                  <div className="tt-hour" key={`h-${hour}`}>{hour}</div>
                  {dayOrder.map((d) => {
                    const cell = grid[hour][d]
                    return (
                      <div key={`c-${hour}-${d}`} className={cell.length ? "tt-cell has" : "tt-cell"}>
                        {cell.map((slot) => (
                          <div key={slot.id} className="tt-slot" style={{ background: `var(--${colorFor(slot.subject)}, var(--navy-50))` }}>
                            <strong>{slot.subject}</strong>
                            {slot.note && <small>{slot.note}</small>}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Add a slot" description="Weekly study or a one-off session.">
          <label>Day
            <select value={day} onChange={(event) => setDay(event.target.value)}>
              {dayOrder.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>Start time
            <select value={start} onChange={(event) => setStart(event.target.value)}>
              {hours.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>Subject
            <select value={subject} onChange={(event) => setSubject(event.target.value as Subject)}>
              {subjects.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Focus, e.g. algebra practice" /></label>
          <button className="primary-button" onClick={add}><Plus size={14} /> Add slot</button>

          <div style={{ height: 18 }} />
          <h2 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--navy-800)" }}>Existing slots</h2>
          {profile.timetable.length === 0 && <p className="muted">Add your first study slot.</p>}
          {profile.timetable.map((slot) => (
            <div className="hw-row" key={slot.id}>
              <Calendar size={14} />
              <div>
                <strong>{slot.day} · {slot.start}</strong>
                <span>{slot.subject}{slot.note ? ` · ${slot.note}` : ""}</span>
              </div>
              <button className="icon-button" onClick={() => remove(slot.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </Panel>
      </div>
    </Page>
  )
}
