import { Trophy } from "lucide-react"
import { classmates } from "../data"
import type { DesktopProfile } from "../storage"
import { initials, Page, PageHeading, Panel } from "../ui"

export function Leaderboard({ profile }: { profile: DesktopProfile }) {
  const me = {
    id: "me",
    name: profile.name || "You",
    classLevel: profile.classLevel || "—",
    points: profile.practicePoints + profile.xp + profile.coins,
    badge: profile.streak >= 3 ? "Streak keeper" : "Rising",
  }
  const combined = [...classmates, me].sort((a, b) => b.points - a.points)
  const rank = combined.findIndex((entry) => entry.id === "me") + 1

  return (
    <Page>
      <PageHeading overline="Ranked" title="Leaderboard" subtitle={`You're currently ranked #${rank}. Keep going.`} aside={<span className="chip"><Trophy size={13} /> Weekly · demo</span>} />
      <Panel>
        <div className="leaderboard-list">
          {combined.map((entry, index) => {
            const rankNumber = index + 1
            const rankClass = rankNumber === 1 ? "lb-rank gold" : rankNumber === 2 ? "lb-rank silver" : rankNumber === 3 ? "lb-rank bronze" : "lb-rank"
            return (
              <div className={entry.id === "me" ? "lb-row me" : "lb-row"} key={entry.id}>
                <span className={rankClass}>{rankNumber}</span>
                <div className="lb-name">
                  <strong>{entry.name}</strong>
                  <small>{entry.classLevel}</small>
                </div>
                <span className="lb-badge">{entry.badge}</span>
                <span className="lb-points">{entry.points.toLocaleString()}</span>
              </div>
            )
          })}
        </div>
      </Panel>
      <div style={{ height: 16 }} />
      <Panel title="How points work">
        <p className="muted">Points come from lessons completed, questions answered correctly, and challenges claimed. The scoreboard on the desktop app uses your local profile plus a demo cohort — when you're signed in to the AeroLearn account, real classmates take their place.</p>
      </Panel>
    </Page>
  )
}
