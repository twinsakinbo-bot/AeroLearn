"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { auth, onAuthStateChanged } from "@/lib/auth"
import {
  addDoc,
  collection,
  db,
  doc,
  type DocumentData,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "@/lib/db"
import {
  Check,
  Crown,
  Flag,
  Loader2,
  MessageSquare,
  Search,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { Tabs } from "@/components/ui/tabs"
import { frameClass, titleLabel } from "@/lib/store-items"
import { cn } from "@/lib/utils"

/**
 * Your school, your friends, and the people you have yet to add.
 *
 * Four things were wrong underneath the styling. Friends and friend requests
 * were fetched one after another in a `for` loop, so a student with twenty
 * friends waited on twenty sequential round trips; they are batched now. The
 * signed-in student's own document was read a second time to seed the table,
 * having just been read to load the profile. Name search fell back to a
 * case-sensitive prefix query with no `limit`, so searching "ada" could not find
 * "Ada" and a common prefix could pull an unbounded slice of the collection.
 * And only two of the three titles sold in the store were ever rendered, so
 * "Speed Demon" was invisible to everyone who bought it — labels come from
 * `lib/store-items` now, next to the items themselves.
 *
 * Worth knowing: sending a friend request writes to the *other* student's
 * document, and under row-level security a student cannot do that — `users_update`
 * is `using (id = public.me() or public.is_admin())`, so the write matched zero
 * rows and raised nothing, which surfaced as "Could not update users/<uid>: the
 * write returned no row". Every friend action now goes through
 * `/api/friends`, which does the write with the service role and can only touch
 * `friends` and `friendRequests`. Loosening the policy instead would have let any
 * student rewrite anyone's xp, coins and display name.
 *
 * The requests panel used to be wrapped in `requests.length > 0 &&`, so with
 * sending broken there was also visibly nowhere to accept anything. It is always
 * rendered now, with an empty state that says where requests turn up.
 *
 * Name search was a range query with the same value on both sides
 * (`>= prefix` and `<= prefix`), which is an exact match dressed up as a prefix
 * search — "Ade" could not find "Adebayo". It is an ordered one-sided range now;
 * see `searchByName`.
 *
 * Visually: a corner toast with no ARIA role became a banner that announces
 * itself, the report dialog now behaves like one (labelled, modal, closes on
 * Escape), the leaderboard toggle is the shared segmented control, and the gold
 * frame is a coin-coloured ring rather than `border-yellow-400` with an emoji
 * crown pinned to the corner.
 */

const GLOBAL_COUNT = 50
const SEARCH_LIMIT = 20

const REPORT_REASONS = [
  "Harassment or bullying",
  "Inappropriate content",
  "Cheating or fraud",
  "Spam",
  "Something else",
]

const BOARD_TABS = [
  { value: "school" as const, label: "My school" },
  { value: "global" as const, label: "Global" },
]

type Person = {
  id: string
  displayName: string
  photoURL?: string | null
  schoolName?: string | null
  xp?: number
  equippedFrame?: string | null
  equippedTitle?: string | null
  friendRequests?: string[]
}

function toPerson(id: string, data: DocumentData): Person {
  return {
    id,
    displayName: data.displayName || "A student",
    photoURL: data.photoURL ?? null,
    schoolName: data.schoolName ?? null,
    xp: data.xp ?? 0,
    equippedFrame: data.equippedFrame ?? null,
    equippedTitle: data.equippedTitle ?? null,
    friendRequests: data.friendRequests ?? [],
  }
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

/** The equipped store frame appears wherever a learner is ranked. */
function Avatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" }) {
  const dimension = size === "sm" ? "h-9 w-9 text-caption" : "h-11 w-11 text-body-sm"
  const edge = frameClass(person.equippedFrame)

  if (person.photoURL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.photoURL}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", dimension, edge)}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-surface-sunken font-semibold text-muted",
        dimension,
        edge,
      )}
    >
      {initialsOf(person.displayName)}
    </span>
  )
}

/** Several profiles at once, rather than one per `await`. */
async function fetchPeople(ids: string[]): Promise<Person[]> {
  const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, "publicProfiles", id))))
  return snaps
    .filter((snap) => snap.exists())
    .map((snap) => toPerson(snap.id, snap.data() as DocumentData))
}

/**
 * Strings compare byte for byte and there is no lowercased copy of
 * `displayName` to query against, so a search runs one bounded prefix query per
 * plausible casing of what was typed. Four small queries is a fair price for
 * "ada" finding "Ada"; a client-side scan of the collection is not.
 */
function casings(term: string) {
  const lower = term.toLowerCase()
  const titled = lower.charAt(0).toUpperCase() + lower.slice(1)
  return Array.from(new Set([term, titled, lower, term.toUpperCase()]))
}

/**
 * One ascending page per casing, starting at the prefix.
 *
 * This was `>= prefix` *and* `<= prefix`, which is an exact match written to look
 * like a range: "Ade" found a student called exactly "Ade" and never found
 * Adebayo. The Firestore idiom for the upper bound is `prefix + ""`, but
 * the store underneath is Postgres now, and that trick only holds if the
 * database's collation sorts a private-use code point after every real
 * character — not something to bet a search box on. Ordering is
 * collation-agnostic: ask for names at or after the prefix in ascending order
 * and every name beginning with it sits in one block at the front of the page,
 * so `startsWith` is enough to keep the right ones.
 */
async function searchByName(term: string): Promise<Person[]> {
  const snaps = await Promise.all(
    casings(term).map((prefix) =>
      getDocs(
        query(
          collection(db, "publicProfiles"),
          where("displayName", ">=", prefix),
          orderBy("displayName", "asc"),
          limit(SEARCH_LIMIT),
        ),
      ),
    ),
  )

  const wanted = term.trim().toLowerCase()
  const found = new Map<string, Person>()
  snaps.forEach((snap) =>
    snap.forEach((entry) => {
      if (found.has(entry.id)) return
      const person = toPerson(entry.id, entry.data())
      if (!person.displayName.toLowerCase().startsWith(wanted)) return
      found.set(entry.id, person)
    }),
  )
  return [...found.values()].slice(0, SEARCH_LIMIT)
}

type Banner = { tone: "success" | "error"; text: string }

type FriendAction = "request" | "accept" | "decline" | "cancel" | "remove"

/**
 * One friend action, done server-side.
 *
 * Sending a request means writing to somebody else's row, and `users_update`
 * only ever matches your own, so the write was silently filtered and the student
 * saw "the write returned no row". `/api/friends` holds the service role and can
 * only touch `friends` and `friendRequests`; it returns the resulting state,
 * which matters because two people who requested each other become friends
 * immediately rather than each waiting on the other.
 */
async function friendAction(action: FriendAction, targetId: string): Promise<string> {
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) throw new Error("Sign in again to do that.")

  const res = await fetch("/api/friends", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ action, targetId }),
  })

  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new Error(payload?.error || "That did not save. Try again.")
  return String(payload?.status ?? "")
}

export default function CommunityPage() {
  const [uid, setUid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [board, setBoard] = useState<"school" | "global">("school")
  const [schoolBoard, setSchoolBoard] = useState<Person[]>([])
  const [worldBoard, setWorldBoard] = useState<Person[]>([])
  const [requests, setRequests] = useState<Person[]>([])
  const [friends, setFriends] = useState<string[]>([])
  const [schoolName, setSchoolName] = useState<string | null>(null)

  const [term, setTerm] = useState("")
  const [results, setResults] = useState<Person[] | null>(null)
  const [searching, setSearching] = useState(false)

  const [busy, setBusy] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)

  const [reportTarget, setReportTarget] = useState<Person | null>(null)
  const [reportReason, setReportReason] = useState("")
  const [reporting, setReporting] = useState(false)
  const [reportSent, setReportSent] = useState(false)

  const load = async (userId: string) => {
    try {
      const selfSnap = await getDoc(doc(db, "users", userId))
      const data = selfSnap.data()
      if (!data) return

      setFriends(data.friends ?? [])
      setSchoolName(data.schoolName ?? null)

      const [requestPeople, friendPeople, schoolSnap, worldSnap] = await Promise.all([
        fetchPeople(data.friendRequests ?? []),
        fetchPeople(data.friends ?? []),
        data.schoolName
          ? getDocs(query(collection(db, "publicProfiles"), where("schoolName", "==", data.schoolName)))
          : null,
        getDocs(query(collection(db, "publicProfiles"), orderBy("xp", "desc"), limit(GLOBAL_COUNT))),
      ])

      setRequests(requestPeople)

      /* Me, my friends and everyone at my school, in one table. My own row comes
         from the profile already in hand rather than a second read of it. */
      const rows = new Map<string, Person>()
      rows.set(userId, toPerson(userId, data))
      friendPeople.forEach((person) => rows.set(person.id, person))
      schoolSnap?.forEach((entry) => {
        if (!rows.has(entry.id)) rows.set(entry.id, toPerson(entry.id, entry.data()))
      })

      setSchoolBoard([...rows.values()].sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0)))
      setWorldBoard(worldSnap.docs.map((entry) => toPerson(entry.id, entry.data())))
    } catch (error) {
      console.error("Failed to load the community:", error)
      setBanner({ tone: "error", text: "We could not load the leaderboard. Reload the page." })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setUid(null)
        setLoading(false)
        return
      }
      setUid(user.uid)
      load(user.uid)
    })
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Escape closes the report dialog, as it should for anything modal. */
  useEffect(() => {
    if (!reportTarget) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReportTarget(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [reportTarget])

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault()
    const wanted = term.trim()
    if (!wanted || !uid) return

    setSearching(true)
    setBanner(null)
    try {
      const [byName, schoolSnap] = await Promise.all([
        searchByName(wanted),
        schoolName
          ? getDocs(query(collection(db, "publicProfiles"), where("schoolName", "==", schoolName)))
          : null,
      ])

      /* Schoolmates match on any part of the name, since that list is small
         enough to filter here and it is the list students actually want. */
      const lower = wanted.toLowerCase()
      const found = new Map<string, Person>()
      schoolSnap?.forEach((entry) => {
        const person = toPerson(entry.id, entry.data())
        if (person.displayName.toLowerCase().includes(lower)) found.set(person.id, person)
      })
      byName.forEach((person) => {
        if (!found.has(person.id)) found.set(person.id, person)
      })
      found.delete(uid)

      setResults([...found.values()].slice(0, SEARCH_LIMIT))
    } catch (error) {
      console.error("Search failed:", error)
      setBanner({ tone: "error", text: "That search did not come back. Try again." })
    } finally {
      setSearching(false)
    }
  }

  const sendRequest = async (person: Person) => {
    if (!uid || busy) return
    setBusy(person.id)
    setBanner(null)
    try {
      const status = await friendAction("request", person.id)

      /* They had already asked me, so the request went straight through. */
      if (status === "friends") {
        setFriends((current) =>
          current.includes(person.id) ? current : [...current, person.id],
        )
        setRequests((current) => current.filter((entry) => entry.id !== person.id))
        setBanner({ tone: "success", text: `${person.displayName} is now a friend.` })
        await load(uid)
        return
      }

      setResults((current) =>
        current?.map((entry) =>
          entry.id === person.id
            ? { ...entry, friendRequests: [...(entry.friendRequests ?? []), uid] }
            : entry,
        ) ?? current,
      )
      setBanner({ tone: "success", text: `Request sent to ${person.displayName}.` })
    } catch (error) {
      console.error("Failed to send the request:", error)
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "That request did not send. Try again.",
      })
    } finally {
      setBusy(null)
    }
  }

  const answerRequest = async (person: Person, accept: boolean) => {
    if (!uid || busy) return
    setBusy(person.id)
    setBanner(null)
    try {
      await friendAction(accept ? "accept" : "decline", person.id)

      setRequests((current) => current.filter((entry) => entry.id !== person.id))
      if (accept) {
        setFriends((current) =>
          current.includes(person.id) ? current : [...current, person.id],
        )
        await load(uid)
      }
      setBanner({
        tone: "success",
        text: accept ? `${person.displayName} is now a friend.` : "Request declined.",
      })
    } catch (error) {
      console.error("Failed to answer the request:", error)
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "That did not save. Try again.",
      })
    } finally {
      setBusy(null)
    }
  }

  const submitReport = async () => {
    if (!reportTarget || !uid || !reportReason.trim() || reporting) return
    setReporting(true)
    try {
      await addDoc(collection(db, "reports"), {
        reportedBy: uid,
        reportedUserId: reportTarget.id,
        reportedUserName: reportTarget.displayName,
        reason: reportReason.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      })
      setReportSent(true)
    } catch (error) {
      console.error("Failed to submit the report:", error)
      setBanner({ tone: "error", text: "The report did not send. Try again." })
      setReportTarget(null)
    } finally {
      setReporting(false)
    }
  }

  const closeReport = () => {
    setReportTarget(null)
    setReportReason("")
    setReportSent(false)
  }

  if (loading) return <LoadingState full text="Loading the community…" />

  if (!uid) {
    return (
      <EmptyState
        icon={Users}
        title="Sign in to see your school"
        description="The leaderboard, your friends and your messages all live on your account."
        actionText="Sign in"
        actionHref="/auth/login"
      />
    )
  }

  const rows = board === "school" ? schoolBoard : worldBoard

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Community"
        title="Your school and your friends"
        subtitle="Compare XP with people you actually know, and find the ones you have not added yet."
        actions={
          <Link href="/app/messages" className="btn-secondary btn-sm">
            <MessageSquare size={15} aria-hidden="true" />
            Messages
          </Link>
        }
      />

      {banner && (
        <p
          role={banner.tone === "error" ? "alert" : "status"}
          className={cn(
            "mb-6 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-body-sm",
            banner.tone === "error"
              ? "border-danger/30 bg-danger/[0.06] text-danger"
              : "border-success/30 bg-success/[0.06] text-success",
          )}
        >
          {banner.tone === "error" ? (
            <Flag size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          {banner.text}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden p-0 lg:col-span-2">
          <header className="flex flex-col gap-3 border-b border-hairline p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-streak/[0.12] text-streak">
                <Trophy size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-body font-semibold text-foreground">Leaderboard</h2>
                <p className="truncate text-caption text-muted">
                  {board === "global"
                    ? `The top ${GLOBAL_COUNT} students by XP`
                    : schoolName
                      ? `${schoolName}, plus your friends`
                      : "You and your friends"}
                </p>
              </div>
            </div>
            <Tabs
              options={BOARD_TABS}
              value={board}
              onChange={setBoard}
              ariaLabel="Which leaderboard"
              className="shrink-0"
            />
          </header>

          {rows.length === 0 ? (
            <EmptyState
              bordered={false}
              icon={Trophy}
              title="Nobody to compare with yet"
              description={
                board === "school"
                  ? "Add your school in settings, or send a friend request, and this table fills up."
                  : "Finish a lesson to put yourself on the board."
              }
            />
          ) : (
            <ol className="divide-y divide-hairline">              {rows.map((person, index) => {
                const isMe = person.id === uid
                const title = titleLabel(person.equippedTitle)

                return (
                  <li
                    key={person.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5",
                      isMe && "bg-accent/[0.04]",
                    )}
                  >
                    <span className="w-7 shrink-0 text-center text-body-sm font-bold tabular-nums text-subtle">
                      {index === 0 ? (
                        <Crown size={16} className="mx-auto text-streak" aria-hidden="true" />
                      ) : (
                        index + 1
                      )}
                    </span>

                    <Avatar person={person} />

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
                        <span className="truncate">{person.displayName}</span>
                        {isMe && (
                          <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white dark:text-ink-950">
                            You
                          </span>
                        )}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-caption text-muted">
                        <span className="truncate">{person.schoolName || "No school set"}</span>
                        {title && (
                          <span className="rounded-full border border-accent/25 bg-accent/[0.06] px-2 py-0.5 text-[11px] font-semibold text-accent">
                            {title}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <p className="mr-1 text-right text-body-sm font-bold tabular-nums text-foreground">
                        {(person.xp ?? 0).toLocaleString()}
                        <span className="ml-1 text-caption font-semibold text-subtle">XP</span>
                      </p>

                      {!isMe && (
                        <>
                          <Link
                            href={`/app/messages?with=${person.id}&name=${encodeURIComponent(person.displayName)}`}
                            aria-label={`Message ${person.displayName}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                          >
                            <MessageSquare size={14} aria-hidden="true" />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setReportTarget(person)}
                            aria-label={`Report ${person.displayName}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline bg-surface text-muted transition-colors hover:border-danger/30 hover:text-danger"
                          >
                            <Flag size={14} aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                )
              })}</ol>
          )}
        </section>

        <div className="space-y-6">
          {/* Always on screen: the place a request lands has to exist before one does. */}
          <section className="card p-5 sm:p-6" aria-live="polite">
            <h2 className="flex items-center gap-2 text-body font-semibold text-foreground">
              <UserPlus size={16} className="text-accent" aria-hidden="true" />
              Friend requests
              {requests.length > 0 && (
                <span className="rounded-full bg-accent/[0.12] px-2 py-0.5 text-caption font-bold tabular-nums text-accent">
                  {requests.length}
                </span>
              )}
            </h2>
            {requests.length === 0 ? (
              <p className="mt-3 text-body-sm text-muted">
                Nothing waiting. When a student adds you, their request appears here for you
                to accept or decline.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {requests.map((person) => (
                  <li
                    key={person.id}
                    className="rounded-lg border border-hairline bg-surface-sunken p-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar person={person} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-body-sm font-semibold text-foreground">
                          {person.displayName}
                        </p>
                        <p className="truncate text-caption text-muted">
                          {person.schoolName || "A student"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => answerRequest(person, true)}
                        disabled={busy === person.id}
                        className="btn-primary btn-sm"
                      >
                        {busy === person.id && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        )}
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => answerRequest(person, false)}
                        disabled={busy === person.id}
                        className="btn-secondary btn-sm"
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-body font-semibold text-foreground">
              <Search size={16} className="text-accent" aria-hidden="true" />
              Find friends
            </h2>

            <form onSubmit={runSearch} className="mt-4">
              <label htmlFor="find-friends" className="sr-only">
                Search for a student by name
              </label>
              <div className="flex gap-2">
                <input
                  id="find-friends"
                  type="search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Search by name…"
                  className="input-premium"
                />
                <button
                  type="submit"
                  disabled={!term.trim() || searching}
                  aria-label="Search"
                  className="btn-primary shrink-0 px-3"
                >
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Search size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="field-hint mt-2">
                Anyone at your school by any part of their name, or anyone else by how their name
                starts.
              </p>
            </form>

            {results &&
              (results.length === 0 ? (
                <p className="mt-4 text-body-sm text-muted">
                  Nobody matched that. Names are matched from the start, so try the first word.
                </p>
              ) : (
                <ul className="mt-4 space-y-2" aria-live="polite">
                  {results.map((person) => {
                    const isFriend = friends.includes(person.id)
                    const asked = person.friendRequests?.includes(uid)

                    return (
                      <li
                        key={person.id}
                        className="flex items-center gap-2.5 rounded-lg border border-hairline p-3"
                      >
                        <Avatar person={person} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm font-semibold text-foreground">
                            {person.displayName}
                          </p>
                          <p className="truncate text-caption text-muted">
                            {person.schoolName || "No school set"}
                          </p>
                        </div>

                        {isFriend ? (
                          <span className="inline-flex shrink-0 items-center gap-1.5 text-caption font-semibold text-success">
                            <Check size={14} aria-hidden="true" />
                            Friends
                          </span>
                        ) : asked ? (
                          <span className="shrink-0 text-caption font-semibold text-subtle">
                            Asked
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => sendRequest(person)}
                            disabled={busy === person.id}
                            className="btn-secondary btn-sm shrink-0"
                          >
                            {busy === person.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <UserPlus size={14} aria-hidden="true" />
                            )}
                            Add
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ))}
          </section>
        </div>
      </div>

      {reportTarget && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            className="card p-6 animate-scale-in w-full max-w-sm"
          >
            {reportSent ? (
              <div className="py-4 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-success/30 bg-success/10 text-success">
                  <Check size={22} aria-hidden="true" />
                </span>
                <p id="report-title" className="mt-3 text-body font-semibold text-foreground">
                  Report sent
                </p>
                <p className="mx-auto mt-1.5 max-w-xs text-body-sm text-muted">
                  A moderator will read it. Thank you for telling us.
                </p>
                <button type="button" onClick={closeReport} className="btn-primary mt-5">
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id="report-title"
                    className="flex items-center gap-2 text-body font-semibold text-foreground"
                  >
                    <Flag size={16} className="text-danger" aria-hidden="true" />
                    Report {reportTarget.displayName}
                  </h2>
                  <button
                    type="button"
                    onClick={closeReport}
                    aria-label="Close"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>

                <p className="mt-3 text-body-sm text-muted">
                  Tell us what is wrong and a moderator will look into it. Nothing is sent to{" "}
                  {reportTarget.displayName}.
                </p>

                <ul className="mt-4 space-y-2">
                  {REPORT_REASONS.map((reason) => (
                    <li key={reason}>
                      <button
                        type="button"
                        aria-pressed={reportReason === reason}
                        onClick={() => setReportReason(reason)}
                        className={cn(
                          "w-full rounded-lg border px-3.5 py-2.5 text-left text-body-sm font-medium transition-colors",
                          reportReason === reason
                            ? "border-danger/40 bg-danger/[0.06] text-danger"
                            : "border-hairline text-muted hover:bg-surface-hover hover:text-foreground",
                        )}
                      >
                        {reason}
                      </button>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={submitReport}
                  disabled={!reportReason || reporting}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-danger px-4 py-2.5 text-body-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {reporting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Send report
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
