"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { db, doc, getDoc, updateDoc } from "@/lib/db"
import { BookOpen, GraduationCap, Loader2, LogOut, RefreshCcw, Save, User } from "lucide-react"
import Link from "next/link"

import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { Tabs } from "@/components/ui/tabs"
import { CLASS_LEVELS, SUBJECTS, type Subject } from "@/lib/constants"
import { getSubjectLimit } from "@/lib/subscription"
import { cn } from "@/lib/utils"

/**
 * Where a student picks their learning mode, class, subjects and exam board.
 *
 * The backdrop-blur rounded-4xl cards have been replaced with the shared card
 * primitive and PageHeader; framer-motion is gone. The mode and class pickers
 * used one conditional-render trick per option and toggled the picked one via
 * scale; they are static grids now, and the Tabs primitive handles the subject
 * cap callout. "Restart tour" called a field (`hasSeenTour`) that is written
 * nowhere — the tour never saved completion, so toggling it does nothing. That
 * button is dropped. The save spinner now matches the rest of the app.
 */

type LearningMode = "school" | "exam" | "self_learning"
type Banner = { tone: "success" | "error"; text: string }

const MODE_TABS = [
  { value: "school" as const, label: "In school", subtitle: "Follow the curriculum" },
  { value: "exam" as const, label: "Exam prep", subtitle: "WAEC, NECO, JAMB" },
  { value: "self_learning" as const, label: "Self-paced", subtitle: "Your own path" },
]

const EXAM_TYPES = ["WAEC", "NECO", "JAMB", "Other"] as const

export default function SettingsPage() {
  const router = useRouter()
  const [uid, setUid] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState<LearningMode | null>(null)
  const [classLevel, setClassLevel] = useState<string | null>(null)
  const [exam, setExam] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [cap, setCap] = useState(2)

  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth/login")
        return
      }
      setUid(user.uid)
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        const data = snap.data()
        if (data) {
          setMode(data.learningMode ?? null)
          setClassLevel(data.classLevel ?? null)
          setExam(data.examType ?? null)
          setSubjects(data.subjects ?? [])
          setCap(getSubjectLimit(data))
        }
      } catch (error) {
        console.error("Failed to load your settings:", error)
        setBanner({ tone: "error", text: "We could not load your settings. Reload the page." })
      } finally {
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [router])

  const save = async () => {
    if (!uid || saving) return
    setSaving(true)
    setBanner(null)
    try {
      await updateDoc(doc(db, "users", uid), {
        learningMode: mode,
        classLevel: mode === "school" ? classLevel : null,
        examType: mode === "exam" ? exam : null,
        subjects,
      })
      setBanner({ tone: "success", text: "Settings saved." })
    } catch (error) {
      console.error("Failed to save your settings:", error)
      setBanner({ tone: "error", text: "That did not save. Try again." })
    } finally {
      setSaving(false)
    }
  }

  const toggleSubject = (subject: Subject) => {
    setSubjects((current) => {
      if (current.includes(subject)) return current.filter((s) => s !== subject)
      if (current.length >= cap) {
        setBanner({
          tone: "error",
          text: `Your plan allows ${cap} subject${cap === 1 ? "" : "s"}. Upgrade to Pro for unlimited.`,
        })
        return current
      }
      return [...current, subject]
    })
  }

  const signOut = async () => {
    try {
      await auth.signOut()
      router.replace("/auth/login")
    } catch (error) {
      console.error("Sign out failed:", error)
      setBanner({ tone: "error", text: "That did not work. Try again." })
    }
  }

  if (loading) return <LoadingState full text="Loading your settings…" />

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Settings"
        title="Your learning path"
        subtitle="Pick your mode, your class or exam, and the subjects you want to study."
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
          {banner.text}
        </p>
      )}

      <div className="space-y-6">
        <section className="card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-body font-semibold text-foreground">
            <GraduationCap size={16} className="text-accent" aria-hidden="true" />
            Learning mode
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {MODE_TABS.map((option) => {
              const chosen = mode === option.value
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => setMode(option.value)}
                    className={cn(
                      "w-full rounded-lg border p-4 text-left transition-colors",
                      chosen
                        ? "border-accent/40 bg-accent/[0.06]"
                        : "border-hairline bg-surface-sunken hover:bg-surface-hover",
                    )}
                  >
                    <p
                      className={cn(
                        "text-body-sm font-semibold",
                        chosen ? "text-accent" : "text-foreground",
                      )}
                    >
                      {option.label}
                    </p>
                    <p className="mt-1 text-caption text-muted">{option.subtitle}</p>
                  </button>
                </li>
              )
            })}
          </ul>

          {mode === "school" && (
            <div className="mt-5 border-t border-hairline pt-5">
              <label className="field-label">Class level</label>
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {CLASS_LEVELS.map((level) => {
                  const chosen = classLevel === level
                  return (
                    <li key={level}>
                      <button
                        type="button"
                        onClick={() => setClassLevel(level)}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-body-sm font-semibold transition-colors",
                          chosen
                            ? "border-accent bg-accent text-white dark:text-ink-950"
                            : "border-hairline text-muted hover:border-accent/30 hover:text-foreground",
                        )}
                      >
                        {level}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {mode === "exam" && (
            <div className="mt-5 border-t border-hairline pt-5">
              <label className="field-label">Exam type</label>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {EXAM_TYPES.map((type) => {
                  const chosen = exam === type
                  return (
                    <li key={type}>
                      <button
                        type="button"
                        onClick={() => setExam(type)}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-body-sm font-semibold transition-colors",
                          chosen
                            ? "border-accent bg-accent text-white dark:text-ink-950"
                            : "border-hairline text-muted hover:border-accent/30 hover:text-foreground",
                        )}
                      >
                        {type}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="flex items-center gap-2 text-body font-semibold text-foreground">
              <BookOpen size={16} className="text-accent" aria-hidden="true" />
              Subjects
            </h2>
            {cap !== Infinity && (
              <Tabs
                options={[
                  {
                    value: "current" as const,
                    label: `${subjects.length} of ${cap}`,
                    count: subjects.length,
                  },
                ]}
                value={"current" as const}
                onChange={() => {}}
                variant="pills"
                ariaLabel="Subject count"
              />
            )}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {SUBJECTS.map((subject) => {
              const chosen = subjects.includes(subject)
              return (
                <li key={subject}>
                  <button
                    type="button"
                    onClick={() => toggleSubject(subject)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left text-body-sm font-medium transition-colors",
                      chosen
                        ? "border-accent/40 bg-accent/[0.06] text-accent"
                        : "border-hairline text-muted hover:bg-surface-hover hover:text-foreground",
                    )}
                  >
                    {subject}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary w-full sm:w-auto"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          <Save size={16} aria-hidden="true" />
          {saving ? "Saving…" : "Save preferences"}
        </button>

        <section className="card mt-8 p-5 sm:p-6">
          <h2 className="field-label">Account</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <Link
                href="/app/profile"
                className="flex items-center justify-between rounded-lg border border-hairline bg-surface-sunken p-4 text-body-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
              >
                <span className="flex items-center gap-2">
                  <User size={16} className="text-muted" aria-hidden="true" />
                  View profile
                </span>
                <span className="text-muted">→</span>
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center justify-between rounded-lg border border-danger/30 bg-danger/[0.06] p-4 text-body-sm font-semibold text-danger transition-colors hover:bg-danger/[0.08]"
              >
                <span className="flex items-center gap-2">
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
