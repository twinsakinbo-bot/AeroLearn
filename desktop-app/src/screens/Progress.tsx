import { lessons } from "../data"
import type { DesktopProfile } from "../storage"
import { Page, PageHeading, Panel, ProgressBar } from "../ui"

export function Progress({ profile }: { profile: DesktopProfile }) {
  const completed = profile.completedLessons.length
  const percent = lessons.length ? Math.round(completed / lessons.length * 100) : 0
  const average = profile.mockResults.length
    ? Math.round(profile.mockResults.reduce((sum, exam) => sum + exam.score / Math.max(1, exam.total), 0) / profile.mockResults.length * 100)
    : null
  const subjects = [...new Set(lessons.map((lesson) => lesson.subject))]

  return <Page>
    <PageHeading overline="Your learning journey" title="Progress" subtitle="A clear view of the work you've done on this device." />
    <div className="progress-hero">
      <div><span className="overline">Library completed</span><strong>{percent}%</strong><p>{completed} of {lessons.length} lessons opened</p></div>
      <ProgressBar percent={percent} />
    </div>
    <div className="stats-grid">
      <Panel title="Practice points"><strong>{profile.practicePoints.toLocaleString()}</strong></Panel>
      <Panel title="Current streak"><strong>{profile.streak} days</strong></Panel>
      <Panel title="Mock exams"><strong>{profile.mockResults.length}</strong></Panel>
      <Panel title="Average mock score"><strong>{average === null ? "No exams yet" : `${average}%`}</strong></Panel>
    </div>
    <div className="section-heading"><div><h2>By subject</h2><p>Keep opening lessons to fill each bar.</p></div></div>
    <div className="weak-grid">
      {subjects.map((subject) => {
        const rows = lessons.filter((lesson) => lesson.subject === subject)
        const done = rows.filter((lesson) => profile.completedLessons.includes(lesson.id)).length
        return <div className="weak-card" key={subject}>
          <h3>{subject}</h3><small>{done} of {rows.length} lessons</small>
          <ProgressBar percent={Math.round(done / Math.max(1, rows.length) * 100)} />
        </div>
      })}
    </div>
  </Page>
}
