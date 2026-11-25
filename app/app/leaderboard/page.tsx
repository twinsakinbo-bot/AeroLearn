"use client"

import { useEffect, useState } from "react"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { collection, db, doc, getDoc, getDocs, limit, orderBy, query } from "@/lib/db"
import { Crown, Flame, Trophy, Zap } from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { cn } from "@/lib/utils"

/**
 * The XP table. Fifty rows, ordered by XP, with the signed-in student's own row
 * picked out — a ranking you cannot find yourself in is just a list of
 * strangers. Anyone outside the fifty gets their own standing in a footer line
 * instead of being left to guess.
 */

const TOP_COUNT = 50

type Entry = {
  id: string
  displayName: string
  photoURL: string
  xp: number
  streak: number
}

/** Initials for a student with no profile picture. */
function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function Avatar({ entry, size }: { entry: Entry; size: "md" | "lg" }) {
  const dimension = size === "lg" ? "h-14 w-14 text-body" : "h-10 w-10 text-caption"

  if (entry.photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.photoURL}
        alt=""
        className={cn("shrink-0 rounded-full border border-hairline object-cover", dimension)}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-sunken font-semibold text-muted",
        dimension,
      )}
    >
      {initialsOf(entry.displayName)}
    </span>
  )
}

/**
 * The top three. Only first place carries colour — three saturated cards side
 * by side compete with each other and none of them wins.
 */
const MEDALS = [
  { medal: "bg-streak/[0.12] text-streak border-streak/30", card: "border-streak/30" },
  { medal: "bg-surface-sunken text-muted border-hairline", card: "" },
  { medal: "bg-surface-sunken text-muted border-hairline", card: "" },
]

function PodiumCard({ entry, rank, isMe }: { entry: Entry; rank: number; isMe: boolean }) {
  const tone = MEDALS[rank - 1] ?? MEDALS[2]

  return (
    <li
      className={cn(
        "card flex flex-col items-center p-5 text-center",
        tone.card,
        isMe && "border-accent/40 bg-accent/[0.04]",
      )}
    >
      <span
        className={cn(
          "mb-3 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-caption font-bold tabular-nums",
          tone.medal,
        )}
      >
        {rank === 1 && <Crown size={14} aria-hidden="true" />}
        {rank}
      </span>

      <Avatar entry={entry} size="lg" />

      <p className="mt-3 w-full truncate text-body-sm font-semibold text-foreground">
        {entry.displayName}
        {isMe && <span className="ml-1.5 text-caption font-medium text-accent">You</span>}
      </p>

      <p className="mt-1 inline-flex items-center gap-1.5 text-caption font-semibold tabular-nums text-accent">
        <Zap size={13} aria-hidden="true" />
        {entry.xp.toLocaleString()} XP
      </p>
    </li>
  )
}

/** One row from fourth place down. */
function Row({ entry, rank, isMe }: { entry: Entry; rank: number; isMe: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors sm:gap-4 sm:px-5",
        isMe ? "bg-accent/[0.06]" : "hover:bg-surface-hover",
      )}
    >
      <span className="w-7 shrink-0 text-caption font-semibold tabular-nums text-subtle">
        {rank}
      </span>

      <Avatar entry={entry} size="md" />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-semibold text-foreground">
          {entry.displayName}
          {isMe && <span className="ml-1.5 text-caption font-medium text-accent">You</span>}
        </span>
        {entry.streak > 0 && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-caption text-muted">
            <Flame size={12} className="text-streak" aria-hidden="true" />
            {entry.streak} day{entry.streak === 1 ? "" : "s"}
          </span>
        )}
      </span>

      <span className="shrink-0 text-body-sm font-semibold tabular-nums text-accent">
        {entry.xp.toLocaleString()}
        <span className="ml-1 text-caption font-medium text-subtle">XP</span>
      </span>
    </li>
  )
}

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [uid, setUid] = useState<string | null>(null)
  const [myXp, setMyXp] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUid(user?.uid ?? null)
      try {
        const snap = await getDocs(
          query(collection(db, "publicProfiles"), orderBy("xp", "desc"), limit(TOP_COUNT)),
        )
        const ranked: Entry[] = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            displayName: (data.displayName as string) || "Anonymous student",
            photoURL: (data.photoURL as string) || "",
            xp: (data.xp as number) || 0,
            streak: (data.streak as number) || 0,
          }
        })
        setEntries(ranked)

        // Only worth a second read when the student is outside the fifty —
        // otherwise their own row is already on screen.
        if (user && !ranked.some((entry) => entry.id === user.uid)) {
          const mine = await getDoc(doc(db, "users", user.uid))
          setMyXp(mine.exists() ? (mine.data().xp as number) || 0 : 0)
        }
      } catch (err) {
        console.error("Failed to load leaderboard:", err)
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  if (loading) return <LoadingState full text="Loading the leaderboard…" />

  const podium = entries.slice(0, 3)
  const rest = entries.slice(3)
  const cutoff = entries.length === TOP_COUNT ? entries[entries.length - 1].xp : null

  return (
    <>
      <PageHeader
        eyebrow="Rankings"
        title="Leaderboard"
        subtitle="The top fifty students by XP. Lessons, practice, quizzes and challenges all add to your total."
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No rankings yet"
          description="Nobody has earned XP so far. Answer a few practice questions and you will be the first name here."
          actionText="Start practising"
          actionHref="/app/practice"
        />
      ) : (
        <>
          {podium.length > 0 && (
            <ul className="mb-6 grid animate-fade-in gap-4 sm:grid-cols-3">
              {podium.map((entry, index) => (
                <PodiumCard
                  key={entry.id}
                  entry={entry}
                  rank={index + 1}
                  isMe={entry.id === uid}
                />
              ))}
            </ul>
          )}

          {rest.length > 0 && (
            <ul className="animate-fade-in-up divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
              {rest.map((entry, index) => (
                <Row key={entry.id} entry={entry} rank={index + 4} isMe={entry.id === uid} />
              ))}
            </ul>
          )}

          {myXp !== null && (
            <p className="mt-6 rounded-xl border border-hairline bg-surface-sunken px-5 py-4 text-body-sm text-muted">
              You are not in the top fifty yet — you have{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {myXp.toLocaleString()} XP
              </span>
              {cutoff !== null && cutoff > myXp && (
                <>
                  , and{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {(cutoff - myXp + 1).toLocaleString()} more
                  </span>{" "}
                  would put you on the board
                </>
              )}
              .
            </p>
          )}
        </>
      )}
    </>
  )

}

