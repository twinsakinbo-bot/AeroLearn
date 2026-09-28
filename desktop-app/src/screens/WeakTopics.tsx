import { Layers, Target } from "lucide-react"
import type { DesktopProfile } from "../storage"
import { Page, PageHeading, Panel, EmptyState, ProgressBar } from "../ui"
import type { View } from "../App"

export function WeakTopics({
  profile,
  onNavigate,
}: {
  profile: DesktopProfile
  onNavigate: (view: View) => void
}) {
  const rows = Object.entries(profile.weakTopics)
    .filter(([, topic]) => topic.misses > 0)
    .sort((a, b) => b[1].misses - a[1].misses)

  const bySubject: Record<string, { key: string; topic: string; misses: number }[]> = {}
  rows.forEach(([key, entry]) => {
    const [, topic] = key.split("::")
    const bucket = bySubject[entry.subject] || (bySubject[entry.subject] = [])
    bucket.push({ key, topic, misses: entry.misses })
  })

  return (
    <Page>
      <PageHeading
        overline="Adaptive"
        title="Weak topics"
        subtitle="What to focus on next, based on your practice."
        aside={<button className="primary-button" onClick={() => onNavigate("practice")}><Target size={14} /> Practice now</button>}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Layers} title="Nothing weak yet" body="As you practice, questions you miss show up here so you know where to focus." action={<button className="primary-button" onClick={() => onNavigate("practice")}>Start practice</button>} />
      ) : (
        <div className="weak-grid">
          {Object.entries(bySubject).map(([subject, topics]) => (
            <div key={subject} className="weak-card">
              <h3>{subject}</h3>
              <small>{topics.length} topic{topics.length === 1 ? "" : "s"} to review</small>
              {topics.map((topic) => {
                const strength = Math.max(10, 100 - topic.misses * 20)
                return (
                  <div key={topic.key} style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: "var(--ink-soft)", fontWeight: 600 }}>{topic.topic}</span>
                      <span style={{ color: "var(--muted)" }}>{topic.misses} miss{topic.misses === 1 ? "" : "es"}</span>
                    </div>
                    <ProgressBar percent={strength} tone={strength < 40 ? "amber" : "cyan"} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 18 }} />
      <Panel title="How this is calculated">
        <p className="muted">Every time you miss a question in practice or a mock exam, its topic gets one strike. Each correct answer removes one strike. Focus your revision on the topics with the most strikes.</p>
      </Panel>
    </Page>
  )
}
