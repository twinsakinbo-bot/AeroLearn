"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { arrayUnion, db, doc, getDoc, increment, updateDoc } from "@/lib/db"
import {
  BookOpen,
  Check,
  CheckCircle2,
  Lightbulb,
  Loader2,
  PenTool,
  Sparkles,
  Video,
  X,
} from "lucide-react"
import { LearningMarkdown } from "@/components/learn/LearningMarkdown"
import "katex/dist/katex.min.css"

import { AiChatBox } from "@/components/learn/AiChatBox"
import { FlashcardDeck } from "@/components/learn/FlashcardDeck"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import type { Lesson } from "@/lib/types/lesson"
import { richText } from "@/lib/rich-text"
import { cn } from "@/lib/utils"

/**
 * One lesson: notes, worked examples, practice questions, and the button that
 * banks the XP.
 *
 * The reward write was a read-modify-write of `xp`, `coins` and
 * `completedLessons` from a profile snapshot taken on mount, so two open tabs
 * could each overwrite the other's total. It is now `increment` plus
 * `arrayUnion`, which the server resolves. The `dailyProgress` field it also
 * maintained is written nowhere else and read nowhere at all, so it is gone.
 *
 * Every colour here was a light-only Tailwind tint — `bg-yellow-50` behind
 * `text-yellow-800`, `text-gray-700` body copy — which meant the whole page was
 * illegible in dark mode.
 */

const XP_PER_LESSON = 10
const COINS_PER_LESSON = 5

type Flashcard = { id: string; term: string; definition: string }

const LETTERS = ["A", "B", "C", "D"] as const

const MARKDOWN_PROSE =
  "prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-foreground prose-p:text-muted prose-li:text-muted prose-a:text-accent prose-strong:text-foreground"

/** A titled card with an icon, used for notes, video and the question set. */
function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof BookOpen
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="card mb-6 p-5 sm:p-7">
      <div className="mb-5 flex items-center gap-3 border-b border-hairline pb-4">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-h4 font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-caption text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/** Idle, chosen, right and wrong — the four states an option can be in. */
function optionTone(selected: boolean, marked: boolean, correct: boolean) {
  if (marked && correct) return "border-success/40 bg-success/10 text-success"
  if (marked && selected) return "border-danger/40 bg-danger/10 text-danger"
  if (marked) return "border-hairline bg-surface text-muted"
  if (selected) return "border-accent bg-accent/10 text-accent"
  return "border-hairline bg-surface text-muted hover:bg-surface-hover hover:text-foreground"
}

function letterTone(selected: boolean, marked: boolean, correct: boolean) {
  if (marked && correct) return "bg-success text-white dark:text-ink-950"
  if (marked && selected) return "bg-danger text-white"
  if (selected) return "bg-accent text-white dark:text-ink-950"
  return "bg-surface-sunken text-subtle"
}

export default function LessonViewPage() {
  const params = useParams()
  const router = useRouter()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)

  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [marked, setMarked] = useState(false)

  const [cards, setCards] = useState<Flashcard[]>([])
  const [cardsOpen, setCardsOpen] = useState(false)
  const [makingCards, setMakingCards] = useState(false)
  const [cardsError, setCardsError] = useState("")

  const [done, setDone] = useState(false)
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        const completed = snap.exists() ? snap.data().completedLessons : null
        if (Array.isArray(completed) && completed.includes(id)) setDone(true)
      } catch (err) {
        console.error("Failed to check your progress:", err)
      }
    })
    return () => unsubscribe()
  }, [id])

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "lessons", id))
        if (snap.exists()) setLesson({ id: snap.id, ...snap.data() } as Lesson)
        else router.replace("/app/learn")
      } catch (err) {
        console.error("Failed to load the lesson:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, router])

  /* Escape closes the flashcard deck, as a dialog should. */
  useEffect(() => {
    if (!cardsOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCardsOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [cardsOpen])

  const makeFlashcards = async () => {
    if (cards.length > 0) {
      setCardsOpen(true)
      return
    }

    const user = auth.currentUser
    if (!user || !lesson) {
      setCardsError("Your session has expired. Sign in again to build a deck.")
      return
    }

    setCardsError("")
    setMakingCards(true)
    try {
      const idToken = await user.getIdToken()
      const res = await fetch("/api/ai-flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ content: lesson.content }),
      })
      const data = await res.json()
      if (!res.ok || !Array.isArray(data.flashcards) || data.flashcards.length === 0) {
        throw new Error(data.error || "No flashcards came back.")
      }
      setCards(data.flashcards)
      setCardsOpen(true)
    } catch (err) {
      console.error("Failed to build flashcards:", err)
      setCardsError("Couldn't build a deck from this lesson. Try again in a moment.")
    } finally {
      setMakingCards(false)
    }
  }

  const complete = async () => {
    const user = auth.currentUser
    if (!user || !lesson?.id || done) return

    setCompleting(true)
    try {
      // Server-resolved so two tabs cannot overwrite each other's totals, and
      // arrayUnion makes a second click a no-op rather than a duplicate entry.
      await updateDoc(doc(db, "users", user.uid), {
        completedLessons: arrayUnion(lesson.id),
        subjectsStudied: arrayUnion(lesson.subject),
        xp: increment(XP_PER_LESSON),
        coins: increment(COINS_PER_LESSON),
      })
      setDone(true)
    } catch (err) {
      console.error("Failed to record the lesson:", err)
    } finally {
      setCompleting(false)
    }
  }

  if (loading) return <LoadingState full text="Loading the lesson…" />
  if (!lesson) return null

  const homework = lesson.homework ?? []
  const score = homework.filter((question, index) => answers[index] === question.correctAnswer).length
  const answered = Object.keys(answers).length

  return (
    <article className="animate-fade-in">
      <PageHeader
        backHref={`/app/learn?subject=${encodeURIComponent(lesson.subject)}`}
        backLabel={`Back to ${lesson.subject}`}
        eyebrow={`${lesson.subject} · ${lesson.classLevel} · ${lesson.term}`}
        title={lesson.topicTitle}
        actions={
          <button
            type="button"
            onClick={makeFlashcards}
            disabled={makingCards}
            className="btn-secondary"
          >
            {makingCards ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {makingCards ? "Building…" : cards.length > 0 ? "Flashcards" : "Make flashcards"}
          </button>
        }
      />

      {cardsError && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-danger/35 bg-danger/10 px-4 py-3 text-body-sm font-medium text-danger"
        >
          {cardsError}
        </p>
      )}

      {lesson.videoUrl && (
        <Section icon={Video} title="Video lesson">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-hairline bg-ink-950">
            <iframe
              src={lesson.videoUrl}
              title={`${lesson.topicTitle} video lesson`}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </Section>
      )}

      <Section icon={BookOpen} title="Notes">
        <div className={MARKDOWN_PROSE}>
          <LearningMarkdown>
            {lesson.content}
          </LearningMarkdown>
        </div>
      </Section>

      {lesson.examples && lesson.examples.length > 0 && (
        <Section icon={Lightbulb} title="Worked examples">
          <ul className="space-y-4">
            {lesson.examples.map((example, index) => (
              <li
                key={index}
                className="rounded-lg border border-accent/25 bg-accent/[0.06] p-4 sm:p-5"
              >
                <p className="mb-2 text-overline uppercase text-subtle">
                  {example.title || `Example ${index + 1}`}
                </p>
                <div className={MARKDOWN_PROSE}>
                  <LearningMarkdown>
                    {example.content}
                  </LearningMarkdown>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {homework.length > 0 && (
        <Section
          icon={PenTool}
          title="Practice questions"
          subtitle={
            marked
              ? `You scored ${score} of ${homework.length}`
              : `${homework.length} question${homework.length === 1 ? "" : "s"} on this topic`
          }
        >
          <ol className="space-y-6">
            {homework.map((question, index) => (
              <li key={index} className="border-t border-hairline pt-6 first:border-t-0 first:pt-0">
                <p className="mb-3 text-body-sm font-semibold text-foreground">
                  <span className="mr-2 tabular-nums text-subtle">{index + 1}.</span>
                  {richText(question.question)}
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  {LETTERS.map((letter) => {
                    const selected = answers[index] === letter
                    const correct = question.correctAnswer === letter
                    return (
                      <button
                        key={letter}
                        type="button"
                        disabled={marked}
                        aria-pressed={selected}
                        onClick={() => setAnswers((prev) => ({ ...prev, [index]: letter }))}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left text-body-sm font-medium transition-colors disabled:cursor-default",
                          optionTone(selected, marked, correct),
                        )}
                      >
                        <span
                          className={cn(
                            "mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-caption font-bold",
                            letterTone(selected, marked, correct),
                          )}
                        >
                          {marked && correct ? (
                            <Check size={13} aria-hidden="true" />
                          ) : marked && selected ? (
                            <X size={13} aria-hidden="true" />
                          ) : (
                            letter
                          )}
                        </span>
                        <span className="min-w-0">{richText(question.options[letter])}</span>
                      </button>
                    )
                  })}
                </div>

                {marked && question.explanation && (
                  <p className="mt-3 rounded-lg border border-hairline bg-surface-sunken px-3.5 py-3 text-caption text-muted">
                    <span className="font-semibold text-foreground">Why: </span>
                    {richText(question.explanation)}
                  </p>
                )}
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-hairline pt-5">
            {marked ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMarked(false)
                    setAnswers({})
                  }}
                  className="btn-secondary"
                >
                  Try again
                </button>
                <p className="text-body-sm font-semibold tabular-nums text-muted" role="status">
                  {score} of {homework.length} correct
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMarked(true)}
                  disabled={answered < homework.length}
                  className="btn-primary"
                >
                  Check answers
                </button>
                <p className="text-caption text-muted">
                  {answered < homework.length
                    ? `${homework.length - answered} still to answer.`
                    : "Every question answered — mark them."}
                </p>
              </>
            )}
          </div>
        </Section>
      )}

      <section className="card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <h2 className="text-h4 font-semibold text-foreground">
            {done ? "Lesson complete" : "Finished this lesson?"}
          </h2>
          <p className="mt-1 text-body-sm text-muted">
            {done
              ? `Banked: +${XP_PER_LESSON} XP and +${COINS_PER_LESSON} coins.`
              : `Mark it done to bank +${XP_PER_LESSON} XP and +${COINS_PER_LESSON} coins.`}
          </p>
        </div>

        {done ? (
          <p className="inline-flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-body-sm font-semibold text-success">
            <CheckCircle2 size={16} aria-hidden="true" />
            Completed
          </p>
        ) : (
          <button type="button" onClick={complete} disabled={completing} className="btn-primary">
            {completing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            {completing ? "Saving…" : "Mark as complete"}
          </button>
        )}
      </section>

      <AiChatBox
        lessonId={lesson.id ?? id}
        topicTitle={lesson.topicTitle}
        subject={lesson.subject}
        content={lesson.content}
      />

      {cardsOpen && cards.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Flashcards for this lesson"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
        >
          <div className="card animate-scale-in w-full max-w-lg p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3 border-b border-hairline pb-4">
              <div className="min-w-0">
                <h2 className="text-h4 font-semibold text-foreground">Flashcards</h2>
                <p className="mt-0.5 text-caption text-muted">
                  {cards.length} key terms pulled from these notes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCardsOpen(false)}
                aria-label="Close flashcards"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <FlashcardDeck cards={cards} onClose={() => setCardsOpen(false)} />
          </div>
        </div>
      )}
    </article>
  )
}

