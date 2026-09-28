import { Award, Check, Target } from "lucide-react"
import { challenges } from "../data"
import { awardStudy, type DesktopProfile } from "../storage"
import { Page, PageHeading, Panel } from "../ui"
import type { View } from "../App"

export function Challenges({
  profile,
  update,
  onNavigate,
  showToast,
}: {
  profile: DesktopProfile
  update: (patch: Partial<DesktopProfile> | ((current: DesktopProfile) => DesktopProfile), toast?: string) => void
  onNavigate: (view: View) => void
  showToast: (text: string) => void
}) {
  const isDone = (id: string) => profile.challenges.some((state) => state.id === id && state.completedAt)

  const claim = (id: string) => {
    const challenge = challenges.find((entry) => entry.id === id)
    if (!challenge || isDone(id)) return
    update((current) => {
      const seeded = awardStudy(current, { coins: challenge.reward, xp: Math.round(challenge.reward / 2) })
      const other = current.challenges.filter((state) => state.id !== id)
      return {
        ...seeded,
        challenges: [...other, { id, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() }],
      }
    }, `Reward claimed · +${challenge.reward} coins`)
  }

  const groups: Record<string, typeof challenges> = { daily: [], weekly: [], "one-time": [] }
  challenges.forEach((challenge) => groups[challenge.cadence].push(challenge))

  return (
    <Page>
      <PageHeading overline="Small wins" title="Challenges" subtitle="Little goals that add up to consistency." />
      {(Object.entries(groups) as [keyof typeof groups, typeof challenges][]).map(([cadence, list]) => (
        <div key={cadence}>
          <div className="section-heading" style={{ marginTop: 22 }}>
            <div>
              <h2 style={{ textTransform: "capitalize" }}>{cadence.replace("-", " ")}</h2>
              <p>{cadence === "daily" ? "Reset every day." : cadence === "weekly" ? "Reset every week." : "Complete once."}</p>
            </div>
          </div>
          <div className="challenge-grid">
            {list.map((challenge) => {
              const done = isDone(challenge.id)
              return (
                <div className="challenge-card" key={challenge.id}>
                  <span className="cost"><Award size={12} /> +{challenge.reward}</span>
                  <h3>{challenge.title}</h3>
                  <p>{challenge.description}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {done ? (
                      <span className="completed-pill"><Check size={12} /> Claimed</span>
                    ) : (
                      <>
                        <button className="primary-button" onClick={() => claim(challenge.id)}>Claim</button>
                        <button className="ghost-button" onClick={() => onNavigate(challenge.action as View)}>
                          <Target size={13} /> Go
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div style={{ height: 22 }} />
      <Panel title="How this works">
        <p className="muted">Challenges are meant to give shape to your week — a nudge to study on Monday morning, or to sit that mock exam you've been putting off. Claiming a challenge grants coins and XP.</p>
      </Panel>
    </Page>
  )
}
