"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  auth,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updateProfile,
  type User,
} from "@/lib/auth"
import { db, deleteDoc, doc, getDoc, updateDoc } from "@/lib/db"
import {
  AlertTriangle,
  ArrowDownRight,
  BarChart3,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Coins,
  Crown,
  Flame,
  Loader2,
  Pencil,
  ShieldCheck,
  Star,
  Trash2,
  User as UserIcon,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { JSS_SUBJECTS, SS_SUBJECTS_BY_DEPARTMENT, type Department } from "@/lib/constants"
import { frameClass, titleLabel } from "@/lib/store-items"
import { cn } from "@/lib/utils"
import { isProUser } from "@/lib/subscription"
import { planName } from "@/lib/plans"

/**
 * Account settings that are about *identity* — photo, name, school, subjects,
 * plan, deletion. Study preferences live in `/app/settings`.
 *
 * The old page opened with a 224px navy-to-cyan gradient banner, a 144px avatar
 * hanging half off it, and `font-black` everywhere; the name was rendered twice
 * (once `hidden sm:block`, once `sm:hidden`) so it had to be kept in sync by
 * hand. Cards were `rounded-[2rem]` `backdrop-blur-2xl` over a translucent
 * surface. All of that is gone in favour of the shared primitives.
 *
 * Five real bugs fixed:
 *
 * 1. **Saving your name did not update the loaded profile.** `handleSaveName`
 *    wrote to Firestore but left `userProfile` stale, so the *next* Cancel
 *    silently reverted the field to the pre-save value. Both saves now patch
 *    local state.
 * 2. **The "Topics" stat was always zero.** It read `completedTopics`, a field
 *    written by nothing — it is initialised to `[]` at signup and never touched
 *    again. The real field is `completedLessons`.
 * 3. **Deleting the account could destroy your data and leave the login alive.**
 *    The Firestore document was deleted *before* `deleteUser`, and the password
 *    was optional, so a stale session hit `auth/requires-recent-login` after the
 *    profile was already gone — an account that can sign in but has no data and
 *    can no longer be repaired from the client. Re-authentication is now
 *    mandatory for password accounts and happens first.
 * 4. **Only two of the three purchasable titles had a label.** "Speed Demon"
 *    rendered as "Scholar". Now uses the shared `titleLabel()`.
 * 5. **The "Advanced Analytics" card was a mock-up** — two tiles that never
 *    load anything, paywalled behind Pro for free users. It sold a feature that
 *    does not exist. It now links to the two pages that really do this work,
 *    `/app/progress` and `/app/weak-topics`.
 *
 * Worth flagging: "Downgrade to Free" writes `subscription: "free"` from the
 * client. If Firestore rules let a student write that field they can also write
 * `"lifetime"`, so the rules must reject it and this button must move to an API
 * route. Account deletion also cannot reach subcollections or the student's rows
 * in `conversations`, `submissions` and `attempts` — that needs a Cloud Function.
 */

type Banner = { tone: "success" | "error"; text: string }

const PLAN_META: Record<
  string,
  { label: string; hint: string; icon: LucideIcon; chip: string }
> = {
  free: {
    label: "Free",
    hint: "Daily caps on practice, mock exams and the tutor.",
    icon: UserIcon,
    chip: "bg-surface-sunken text-subtle",
  },
  pending: {
    label: "Pending review",
    hint: "We are confirming your transfer. This usually takes a few hours.",
    icon: ShieldCheck,
    chip: "bg-warn/10 text-warn",
  },
  weekly: {
    label: "Weekly Pro",
    hint: "Full access, renews weekly.",
    icon: Zap,
    chip: "bg-accent/10 text-accent",
  },
  monthly: {
    label: "Monthly Pro",
    hint: "Full access, renews monthly.",
    icon: Crown,
    chip: "bg-accent/10 text-accent",
  },
  pro: {
    label: "24-hour Trust Pass",
    hint: "Full access while your receipt is reviewed.",
    icon: Crown,
    chip: "bg-accent/10 text-accent",
  },
  lifetime: {
    label: "Lifetime Pro",
    hint: "Full access, no renewal.",
    icon: Crown,
    chip: "bg-streak/10 text-streak",
  },
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export default function ProfilePage() {
  const router = useRouter()

  const [authUser, setAuthUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<Banner | null>(null)

  const [displayName, setDisplayName] = useState("")
  const [schoolName, setSchoolName] = useState("")
  const [photoURL, setPhotoURL] = useState("")
  const [editingName, setEditingName] = useState(false)
  const [editingSubjects, setEditingSubjects] = useState(false)
  const [picks, setPicks] = useState<string[]>([])

  const [saving, setSaving] = useState(false)
  const [savingSubjects, setSavingSubjects] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downgrading, setDowngrading] = useState(false)

  const [showDelete, setShowDelete] = useState(false)
  const [showDowngrade, setShowDowngrade] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [password, setPassword] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        return
      }
      setAuthUser(user)
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (snap.exists()) {
          const data = snap.data()
          setProfile(data)
          setDisplayName(data.displayName || user.displayName || "")
          setSchoolName(data.schoolName || "")
          setPhotoURL(data.photoURL || user.photoURL || "")
          setPicks(Array.isArray(data.subjects) ? data.subjects : [])
        }
      } catch (error) {
        console.error("Failed to load your profile:", error)
      } finally {
        setLoading(false)
      }
    })

    return () => {
      unsubscribe()
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    }
  }, [router])

  /* One place to raise a message, and one timer to clear it — the old version
     started a fresh 3s timeout per toast and never cleared any of them. */
  const flash = (tone: Banner["tone"], text: string) => {
    setBanner({ tone, text })
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    bannerTimerRef.current = setTimeout(() => setBanner(null), 4000)
  }

  const onPickAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !authUser) return
    if (file.size > MAX_AVATAR_BYTES) {
      flash("error", "That image is over 5 MB. Pick a smaller one.")
      return
    }

    setUploading(true)
    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "rwlflvjg"
      const body = new FormData()
      body.append("file", file)
      body.append("upload_preset", "aerolearn_avatars")
      body.append("folder", `avatars/${authUser.uid}`)

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body,
      })
      const data = await res.json()
      if (!data.secure_url) throw new Error("The upload did not return an image URL.")

      await updateProfile(authUser, { photoURL: data.secure_url })
      await updateDoc(doc(db, "users", authUser.uid), { photoURL: data.secure_url })
      setPhotoURL(data.secure_url)
      setProfile((prev: any) => ({ ...prev, photoURL: data.secure_url }))
      flash("success", "Photo updated.")
    } catch (error: any) {
      console.error("Avatar upload failed:", error)
      flash("error", error?.message || "The upload failed. Try again.")
    } finally {
      setUploading(false)
    }
  }

  const saveDetails = async () => {
    if (!authUser) return
    const name = displayName.trim()
    if (!name) {
      flash("error", "Your name cannot be empty.")
      return
    }
    setSaving(true)
    try {
      const school = schoolName.trim()
      await updateProfile(authUser, { displayName: name })
      await updateDoc(doc(db, "users", authUser.uid), {
        displayName: name,
        schoolName: school,
      })
      /* Patch the loaded profile too, or Cancel later restores the old values. */
      setProfile((prev: any) => ({ ...prev, displayName: name, schoolName: school }))
      setDisplayName(name)
      setSchoolName(school)
      setEditingName(false)
      flash("success", "Details saved.")
    } catch (error) {
      console.error("Failed to save your details:", error)
      flash("error", "That did not save. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  const saveSubjects = async () => {
    if (!authUser) return
    if (picks.length === 0) {
      flash("error", "Choose at least one subject.")
      return
    }
    setSavingSubjects(true)
    try {
      await updateDoc(doc(db, "users", authUser.uid), { subjects: picks })
      setProfile((prev: any) => ({ ...prev, subjects: picks }))
      setEditingSubjects(false)
      flash("success", "Subjects saved.")
    } catch (error) {
      console.error("Failed to save your subjects:", error)
      flash("error", "That did not save. Try again.")
    } finally {
      setSavingSubjects(false)
    }
  }

  const downgrade = async () => {
    if (!authUser) return
    setDowngrading(true)
    try {
      await updateDoc(doc(db, "users", authUser.uid), {
        subscription: "free",
        proExpiresAt: null,
      })
      setProfile((prev: any) => ({ ...prev, subscription: "free", proExpiresAt: null }))
      setShowDowngrade(false)
      flash("success", "You are on the Free plan now.")
    } catch (error) {
      console.error("Downgrade failed:", error)
      flash("error", "That did not go through. Contact support and we will do it for you.")
    } finally {
      setDowngrading(false)
    }
  }

  const deleteAccount = async () => {
    if (!authUser || confirmText !== "DELETE") return
    setDeleting(true)
    setDeleteError("")
    try {
      /* Re-authenticate BEFORE anything is destroyed. The old order deleted the
         Firestore document first, so a `requires-recent-login` failure left a
         live login with no profile behind it. */
      const hasPassword = authUser.providerData.some((p) => p.providerId === "password")
      if (hasPassword) {
        if (!password) {
          setDeleteError("Enter your password to confirm.")
          setDeleting(false)
          return
        }
        const credential = EmailAuthProvider.credential(authUser.email ?? "", password)
        await reauthenticateWithCredential(authUser, credential)
      }

      await deleteDoc(doc(db, "users", authUser.uid))
      await deleteUser(authUser)
      router.replace("/")
    } catch (error: any) {
      if (error?.code === "auth/wrong-password" || error?.code === "auth/invalid-credential") {
        setDeleteError("That password is not right.")
      } else if (error?.code === "auth/requires-recent-login") {
        setDeleteError("Sign out, sign back in, and try again.")
      } else if (error?.code === "auth/too-many-requests") {
        setDeleteError("Too many attempts. Wait a few minutes.")
      } else {
        setDeleteError(error?.message || "The account could not be deleted.")
      }
      setDeleting(false)
    }
  }

  const closeDelete = () => {
    setShowDelete(false)
    setConfirmText("")
    setPassword("")
    setDeleteError("")
  }

  useEffect(() => {
    if (!showDelete && !showDowngrade) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (showDelete && !deleting) closeDelete()
      if (showDowngrade && !downgrading) setShowDowngrade(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showDelete, showDowngrade, deleting, downgrading])

  if (loading) return <LoadingState full text="Loading your profile…" />

  const availableSubjects: readonly string[] = profile?.classLevel?.startsWith("JSS")
    ? JSS_SUBJECTS
    : profile?.department
      ? SS_SUBJECTS_BY_DEPARTMENT[profile.department as Department] ?? []
      : []

  const plan: string = profile?.subscription || "free"
  const planMeta = !isProUser(profile)
    ? PLAN_META.free
    : plan === "pro" && !profile?.trustPassRequestId
      ? { ...PLAN_META.pro, label: "Pro", hint: "Full access." }
      : PLAN_META[plan] ?? {
          label: `${planName(plan)} Pro`.replace("Pro Pro", "Pro"),
          hint: "Full access during your plan.",
          icon: Crown,
          chip: "bg-accent/10 text-accent",
        }
  const PlanIcon = planMeta.icon
  const savedSubjects: string[] = Array.isArray(profile?.subjects) ? profile.subjects : []
  const title = titleLabel(profile?.equippedTitle)
  const renews =
    profile?.proExpiresAt?.seconds
      ? new Date(profile.proExpiresAt.seconds * 1000).toLocaleDateString()
      : null

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Your profile"
        subtitle="Your photo, name and subjects. Study preferences live in settings."
        actions={
          <Link href="/app/settings" className="btn-secondary btn-sm">
            Settings
          </Link>
        }
      />

      {banner && (
        <p
          role={banner.tone === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-body-sm",
            banner.tone === "error"
              ? "border-danger/30 bg-danger/[0.06] text-danger"
              : "border-success/30 bg-success/[0.06] text-success",
          )}
        >
          {banner.text}
        </p>
      )}

      <section className="card flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:p-8 sm:text-left">
        <div className="relative shrink-0">
          <span className={cn("flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-surface-sunken text-subtle", frameClass(profile?.equippedFrame))}>
            {uploading ? (
              <Loader2 size={24} className="animate-spin text-accent" aria-hidden="true" />
            ) : photoURL ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photoURL} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserIcon size={32} aria-hidden="true" />
            )}
          </span>
          <label className="absolute -bottom-1 -right-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-hairline bg-surface text-muted shadow-sm transition-colors hover:text-accent">
            <Camera size={15} aria-hidden="true" />
            <span className="sr-only">Change your photo</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={onPickAvatar}
            />
          </label>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h2 className="text-h2 text-foreground">{displayName || "Student"}</h2>
            {title && (
              <span className="inline-flex items-center gap-1 rounded-full bg-streak/10 px-2.5 py-1 text-caption font-semibold uppercase tracking-wide text-streak">
                <Star size={10} aria-hidden="true" />
                {title}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-body-sm text-muted">{authUser?.email}</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-1.5 text-caption font-semibold text-muted">
            {profile?.classLevel || "No class set"}
            {profile?.department ? ` · ${profile.department}` : ""}
          </p>
        </div>

        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-semibold",
            planMeta.chip,
          )}
        >
          <PlanIcon size={13} aria-hidden="true" />
          {planMeta.label}
        </span>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Streak"
          value={profile?.streak ?? 0}
          hint={`Best ${profile?.longestStreak ?? 0} days`}
          icon={Flame}
          tone={(profile?.streak ?? 0) > 0 ? "streak" : "neutral"}
        />
        <StatCard label="Total XP" value={profile?.xp ?? 0} icon={Zap} tone="accent" href="/app/progress" />
        <StatCard label="Coins" value={profile?.coins ?? 0} icon={Coins} tone="warn" href="/app/store" />
        <StatCard
          label="Lessons done"
          value={profile?.completedLessons?.length ?? 0}
          icon={BookOpen}
          tone="success"
          href="/app/learn"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-hairline pb-4">
            <h2 className="text-h4 text-foreground">Personal details</h2>
            {!editingName && (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-caption font-semibold text-accent transition-colors hover:bg-accent/[0.08]"
              >
                <Pencil size={12} aria-hidden="true" />
                Edit
              </button>
            )}
          </div>

          {editingName ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="profile-name" className="field-label">
                  Display name
                </label>
                <input
                  id="profile-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="input-premium"
                />
              </div>
              <div>
                <label htmlFor="profile-school" className="field-label">
                  School
                </label>
                <input
                  id="profile-school"
                  value={schoolName}
                  onChange={(event) => setSchoolName(event.target.value)}
                  placeholder="e.g. King's College Lagos"
                  className="input-premium"
                />
                <p className="field-hint">Used for inter-school leaderboards.</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => void saveDetails()}
                  disabled={saving}
                  className="btn-primary flex-1"
                >
                  {saving ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <>
                      <Check size={16} aria-hidden="true" />
                      Save
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false)
                    setDisplayName(profile?.displayName || "")
                    setSchoolName(profile?.schoolName || "")
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <dl className="space-y-4">
              <div>
                <dt className="text-overline text-subtle">Display name</dt>
                <dd className="mt-1 text-body font-medium text-foreground">
                  {displayName || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-overline text-subtle">School</dt>
                <dd className="mt-1 text-body font-medium text-foreground">{schoolName || "—"}</dd>
              </div>
              <div>
                <dt className="text-overline text-subtle">Class</dt>
                <dd className="mt-1 text-body font-medium text-foreground">
                  {profile?.classLevel
                    ? `${profile.classLevel}${profile.department ? ` · ${profile.department}` : ""}`
                    : "—"}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <section className="card flex flex-col p-6">
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-hairline pb-4">
            <h2 className="text-h4 text-foreground">Your subjects</h2>
            {!editingSubjects && availableSubjects.length > 0 && (
              <button
                type="button"
                onClick={() => setEditingSubjects(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-caption font-semibold text-accent transition-colors hover:bg-accent/[0.08]"
              >
                <Pencil size={12} aria-hidden="true" />
                Edit
              </button>
            )}
          </div>

          {editingSubjects ? (
            <div className="flex flex-1 flex-col">
              <p className="field-hint mb-3">
                {picks.length} selected. These drive your dashboard and lesson list.
              </p>
              <div className="mb-4 grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {availableSubjects.map((subject) => {
                  const picked = picks.includes(subject)
                  return (
                    <button
                      key={subject}
                      type="button"
                      aria-pressed={picked}
                      onClick={() =>
                        setPicks((prev) =>
                          prev.includes(subject)
                            ? prev.filter((s) => s !== subject)
                            : [...prev, subject],
                        )
                      }
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-body-sm font-medium transition-colors",
                        picked
                          ? "border-accent bg-accent/[0.08] text-foreground"
                          : "border-hairline text-muted hover:bg-surface-hover hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          picked ? "border-accent bg-accent text-white" : "border-hairline",
                        )}
                      >
                        {picked && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                      </span>
                      <span className="truncate">{subject}</span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-auto flex gap-3">
                <button
                  type="button"
                  onClick={() => void saveSubjects()}
                  disabled={savingSubjects}
                  className="btn-primary flex-1"
                >
                  {savingSubjects ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <>
                      <Check size={16} aria-hidden="true" />
                      Save
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSubjects(false)
                    setPicks(savedSubjects)
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : savedSubjects.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {savedSubjects.map((subject) => (
                <li
                  key={subject}
                  className="rounded-lg border border-hairline bg-surface-sunken px-3 py-1.5 text-body-sm font-medium text-foreground"
                >
                  {subject}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surface-sunken text-subtle">
                <BookOpen size={20} aria-hidden="true" />
              </span>
              <p className="text-body-sm text-muted">No subjects chosen yet.</p>
              {availableSubjects.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setEditingSubjects(true)}
                  className="btn-secondary btn-sm mt-4"
                >
                  Choose subjects
                </button>
              ) : (
                <p className="field-hint mt-2">
                  Set your class and department in settings first.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-5 border-b border-hairline pb-4 text-h4 text-foreground">
            Your plan
          </h2>

          <div className="flex items-start gap-4">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                planMeta.chip,
              )}
            >
              <PlanIcon size={18} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-body font-semibold text-foreground">{planMeta.label}</p>
              <p className="mt-1 text-body-sm text-muted">{planMeta.hint}</p>
              {plan !== "lifetime" && isProUser(profile) && (
                <p className="mt-1 text-caption text-subtle">
                  {renews ? `Runs until ${renews}.` : "Renewal date unavailable."}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {plan !== "lifetime" && (
              <Link href="/app/upgrade" className="btn-primary">
                <Crown size={16} aria-hidden="true" />
                {plan === "free" ? "See Pro plans" : "Change plan"}
              </Link>
            )}
            {plan !== "free" && plan !== "lifetime" && (
              <button
                type="button"
                onClick={() => setShowDowngrade(true)}
                className="btn-secondary"
              >
                Move to Free
              </button>
            )}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-5 border-b border-hairline pb-4 text-h4 text-foreground">
            Your analytics
          </h2>
          <p className="mb-4 text-body-sm text-muted">
            Both of these read your real attempt history — no Pro plan required.
          </p>

          <ul className="space-y-2">
            <li>
              <Link
                href="/app/progress"
                className="flex items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-3 transition-colors hover:border-accent/30 hover:bg-surface-hover"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <BarChart3 size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-semibold text-foreground">
                    Performance by subject
                  </span>
                  <span className="block text-caption text-muted">
                    Scores and XP over time.
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-subtle" aria-hidden="true" />
              </Link>
            </li>
            <li>
              <Link
                href="/app/weak-topics"
                className="flex items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-3 transition-colors hover:border-accent/30 hover:bg-surface-hover"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn/10 text-warn">
                  <ArrowDownRight size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-semibold text-foreground">
                    Topics to review
                  </span>
                  <span className="block text-caption text-muted">
                    Where your answers go wrong most.
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-subtle" aria-hidden="true" />
              </Link>
            </li>
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-danger/25 bg-danger/[0.04] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-body font-semibold text-foreground">Delete this account</h2>
              <p className="mt-1 max-w-md text-body-sm text-muted">
                Your profile, XP, streak and coins go for good. Purchases are not refunded and
                this cannot be undone.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="shrink-0 rounded-xl border border-danger/30 bg-surface px-5 py-3 text-body-sm font-semibold text-danger transition-colors hover:bg-danger/[0.08]"
          >
            <span className="inline-flex items-center gap-2">
              <Trash2 size={15} aria-hidden="true" />
              Delete account
            </span>
          </button>
        </div>
      </section>

      {showDowngrade && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="downgrade-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4"
        >
          <div className="animate-scale-in w-full rounded-t-2xl border border-hairline bg-surface p-6 sm:max-w-md sm:rounded-2xl">
            <h2 id="downgrade-title" className="text-h3 text-foreground">
              Move to the Free plan?
            </h2>
            <p className="mt-2 text-body-sm text-muted">
              You keep your XP, streak and coins. Daily caps come back on practice sets, mock
              exams and the tutor, and any time left on this plan is not refunded.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDowngrade(false)}
                className="btn-secondary flex-1"
              >
                Keep Pro
              </button>
              <button
                type="button"
                onClick={() => void downgrade()}
                disabled={downgrading}
                className="btn-primary flex-1"
              >
                {downgrading ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  "Move to Free"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-4"
        >
          <div className="animate-scale-in max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-hairline bg-surface p-6 sm:max-w-md sm:rounded-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
                <AlertTriangle size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="delete-title" className="text-h3 text-foreground">
                  Delete account
                </h2>
                <p className="mt-0.5 text-caption text-subtle">This is permanent.</p>
              </div>
              <button
                type="button"
                onClick={closeDelete}
                disabled={deleting}
                aria-label="Close"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <p className="mt-5 text-body-sm text-muted">
              Everything on this account goes — progress, coins, purchases and messages you sent.
              Type <strong className="font-semibold text-danger">DELETE</strong> to confirm.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="delete-confirm" className="field-label">
                  Confirmation
                </label>
                <input
                  id="delete-confirm"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  className="input-premium font-mono"
                />
              </div>

              {authUser?.providerData.some((p) => p.providerId === "password") && (
                <div>
                  <label htmlFor="delete-password" className="field-label">
                    Your password
                  </label>
                  <input
                    id="delete-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    className="input-premium"
                  />
                  <p className="field-hint">
                    We re-check it before anything is removed.
                  </p>
                </div>
              )}

              {deleteError && (
                <p role="alert" className="text-body-sm text-danger">
                  {deleteError}
                </p>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeDelete}
                disabled={deleting}
                className="btn-secondary flex-1"
              >
                Keep my account
              </button>
              <button
                type="button"
                onClick={() => void deleteAccount()}
                disabled={confirmText !== "DELETE" || deleting}
                className="flex-1 rounded-xl bg-danger px-5 py-3 text-body-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {deleting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                    Deleting
                  </span>
                ) : (
                  "Delete for good"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
