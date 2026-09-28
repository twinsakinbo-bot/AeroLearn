"use client"

import { Trophy, Flame, Target } from "lucide-react"
import Link from "next/link"

interface LeaderboardEntry {
  rank: number
  name: string
  points: number
  streak: number
  school?: string
}

// Mock data - replace with real Supabase query
const MOCK_LEADERS: LeaderboardEntry[] = [
  { rank: 1, name: "Chioma A.", points: 12847, streak: 42, school: "Queens College" },
  { rank: 2, name: "David O.", points: 11923, streak: 38, school: "Kings College" },
  { rank: 3, name: "Blessing E.", points: 10456, streak: 31, school: "Federal Gov. College" },
  { rank: 4, name: "Emmanuel C.", points: 9821, streak: 29 },
  { rank: 5, name: "Fatima M.", points: 9214, streak: 27 },
  { rank: 6, name: "Chukwuma N.", points: 8967, streak: 25 },
  { rank: 7, name: "Aisha K.", points: 8543, streak: 24 },
  { rank: 8, name: "Peter I.", points: 8201, streak: 22 },
  { rank: 9, name: "Grace U.", points: 7988, streak: 21 },
  { rank: 10, name: "Samuel T.", points: 7654, streak: 19 },
]

export function PublicLeaderboard() {
  return (
    <div className="card-glass overflow-hidden p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-h3 text-foreground">Top Students This Week</h3>
          <p className="mt-1 text-caption text-muted">
            Join <strong className="text-foreground">2,847</strong> students competing right now
          </p>
        </div>
        <Trophy className="h-8 w-8 text-warn" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        {MOCK_LEADERS.slice(0, 5).map((entry) => (
          <div
            key={entry.rank}
            className="flex items-center gap-4 rounded-lg border border-hairline bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                entry.rank === 1
                  ? "bg-gradient-to-br from-warn to-accent text-white"
                  : entry.rank === 2
                  ? "bg-accent/20 text-accent"
                  : entry.rank === 3
                  ? "bg-warn/20 text-warn"
                  : "bg-surface-sunken text-muted"
              }`}
            >
              {entry.rank}
            </span>
            <div className="flex-1">
              <p className="text-body-sm font-semibold text-foreground">{entry.name}</p>
              {entry.school && (
                <p className="text-xs text-muted">{entry.school}</p>
              )}
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <div className="flex items-center gap-1.5 text-body-sm font-semibold text-foreground">
                  <Target className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                  {entry.points.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-body-sm font-semibold text-warn">
                  <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                  {entry.streak}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/auth/signup"
        className="btn-secondary btn-block mt-6"
      >
        Join the leaderboard
      </Link>
    </div>
  )
}
