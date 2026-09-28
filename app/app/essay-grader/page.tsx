"use client"

import { useEffect, useRef, useState } from "react"
import { auth, onAuthStateChanged } from "@/lib/auth"
import { Camera, CheckCircle2, Loader2, Lock, RefreshCcw, Sparkles, X } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { PageHeader } from "@/components/ui/page-header"
import { SUBJECTS } from "@/lib/constants"
import { getUserSubscription } from "@/lib/subscription"

/**
 * Photograph a handwritten theory answer, get it marked.
 *
 * The Pro gate is enforced in `/api/ai-essay-grader` as well as here — it used
 * to exist only in this file, which meant the endpoint itself was open to
 * anyone. Failures now surface in the page instead of a browser `alert()`.
 */

const MAX_BYTES = 5 * 1024 * 1024

export default function EssayGraderPage() {
  const [isPro, setIsPro] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)

  const [subject, setSubject] = useState<string>(SUBJECTS[0])
  const [question, setQuestion] = useState("")
  const [image, setImage] = useState<string | null>(null)
  const [grading, setGrading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsPro(false)
        setChecking(false)
        return
      }
      try {
        const subscription = await getUserSubscription(user.uid)
        setIsPro(subscription.isPro)
      } catch (err) {
        console.error("Failed to check subscription:", err)
        setIsPro(false)
      } finally {
        setChecking(false)
      }
    })
    return () => unsubscribe()
  }, [])

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = "" // so re-picking the same file still fires onChange
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError("That file is not an image. Take a photo or choose a picture.")
      return
    }
    if (file.size > MAX_BYTES) {
      setError("That image is larger than 5MB. Try a smaller photo.")
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setError("")
      setImage(reader.result as string)
    }
    reader.onerror = () => setError("That image could not be read. Try another one.")
    reader.readAsDataURL(file)
  }

  const grade = async () => {
    const user = auth.currentUser
    if (!user) {
      setError("Your session has expired. Sign in again to have your answer marked.")
      return
    }
    if (!question.trim() || !image) return

    setError("")
    setGrading(true)
    try {
      const idToken = await user.getIdToken()
      const res = await fetch("/api/ai-essay-grader", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ subject, question, imageBase64: image }),
      })
      const data = await res.json()
      if (!res.ok || !data.result) {
        throw new Error(data.error || "Grading failed.")
      }
      setResult(data.result)
    } catch (err) {
      console.error("Failed to grade essay:", err)
      setError(err instanceof Error ? err.message : "Grading failed. Try again in a moment.")
    } finally {
      setGrading(false)
    }
  }

  const reset = () => {
    setResult(null)
    setImage(null)
    setQuestion("")
    setError("")
  }

  if (checking) return <LoadingState full text="Checking your plan…" />

  const header = (
    <PageHeader
      eyebrow="Marking"
      title="Essay grader"
      subtitle="Photograph a handwritten theory answer and have it marked against the WAEC scheme, with a transcription so you can see what was read."
    />
  )

  if (!isPro) {
    return (
      <>
        {header}
        <EmptyState
          icon={Lock}
          title="Essay grading is a Pro feature"
          description="Marking a handwritten answer needs handwriting recognition, which is part of Pro. Everything else in your account stays as it is."
          actionText="See Pro plans"
          actionHref="/app/upgrade"
        />
      </>
    )
  }

  if (result) {
    return (
      <>
        <PageHeader
          eyebrow="Marking"
          title="Your marked answer"
          subtitle={`${subject} · graded against the WAEC scheme`}
          actions={
            <button type="button" onClick={reset} className="btn-secondary btn-sm">
              <RefreshCcw size={15} aria-hidden="true" />
              Grade another
            </button>
          }
        />

        <article className="card animate-fade-in p-5 sm:p-7">
          <p className="mb-5 inline-flex items-center gap-2 border-b border-hairline pb-4 text-caption font-semibold text-success">
            <CheckCircle2 size={16} aria-hidden="true" />
            Marking complete
          </p>
          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-foreground prose-p:text-muted prose-a:text-accent prose-strong:text-foreground prose-li:text-muted">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        </article>

        <p className="mt-4 text-caption text-muted">
          Marks are an estimate from a model reading your handwriting — check the transcription above
          before trusting the grade.
        </p>
      </>
    )
  }

  return (
    <>
      {header}

      <section className="card p-5 sm:p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-5">
            <div>
              <label htmlFor="eg-subject" className="field-label">
                Subject
              </label>
              <select
                id="eg-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="select-premium"
              >
                {SUBJECTS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="eg-question" className="field-label">
                The question you answered
              </label>
              <textarea
                id="eg-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="e.g. Discuss the causes of the Aba Women's Riot of 1929."
                className="input-premium resize-none"
              />
              <p className="field-hint">
                Copy it out as it appears on the paper — the marking scheme depends on it.
              </p>
            </div>
          </div>

          <div>
            <p className="field-label">Your handwritten answer</p>

            {image ? (
              <figure className="relative overflow-hidden rounded-xl border border-hairline">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="The answer you photographed" className="h-64 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface/90 px-3 py-1.5 text-caption font-semibold text-danger backdrop-blur-sm transition-colors hover:bg-surface"
                >
                  <X size={14} aria-hidden="true" />
                  Remove
                </button>
              </figure>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-64 w-full flex-col items-center justify-center rounded-xl border border-dashed border-hairline bg-surface-sunken transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-surface text-accent">
                  <Camera size={20} aria-hidden="true" />
                </span>
                <span className="mt-3 text-body-sm font-semibold text-foreground">
                  Take or choose a photo
                </span>
                <span className="mt-1 text-caption text-muted">
                  Clear handwriting, good light, under 5MB
                </span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-danger/35 bg-danger/10 px-4 py-3 text-body-sm font-medium text-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-hairline pt-5">
          <button
            type="button"
            onClick={grade}
            disabled={grading || !question.trim() || !image}
            className="btn-primary"
          >
            {grading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {grading ? "Marking…" : "Grade my answer"}
          </button>

          <p className="text-caption text-muted" role={grading ? "status" : undefined}>
            {grading
              ? "Reading your handwriting and checking it against the scheme — this takes a few seconds."
              : !image
                ? "Add a photo of your answer to continue."
                : !question.trim()
                  ? "Add the question to continue."
                  : "One answer at a time gives the most accurate marking."}
          </p>
        </div>
      </section>
    </>
  )
}

