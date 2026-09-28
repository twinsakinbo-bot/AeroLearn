"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db, doc, FieldPath, getDoc, increment, updateDoc } from "@/lib/db"
import { Loader2, Lock, Send, Sparkles, X } from "lucide-react"

import { isProUser } from "@/lib/subscription"
import { cn } from "@/lib/utils"

/**
 * The tutor panel on a lesson page: a capped number of questions per lesson,
 * answered with that lesson's own notes as context.
 *
 * Pro was decided here with `subscription === "pro" || "lifetime"`, which both
 * missed the weekly and monthly plans and ignored `proExpiresAt`, so an expired
 * subscriber kept the higher cap; it now uses the shared `isProUser`. The usage
 * counter was a read-modify-write of the whole `aiUsage` map, so two lessons open
 * at once would clobber each other's counts — it is a single `increment` on one
 * field path now. Visually this was a violet gradient over light-only greys.
 */

const FREE_QUESTIONS = 2
const PRO_QUESTIONS = 5

type Message = { role: "user" | "ai"; text: string }

/** The route is told to answer in plain text with simple bold, so that is all we render. */
function renderText(text: string) {
  return text.split(/(\*\*.*?\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}

export function AiChatBox({
  lessonId,
  topicTitle,
  subject,
  content,
}: {
  lessonId: string
  topicTitle: string
  subject: string
  content: string
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      text: `Ask me anything about **${topicTitle}** — I can see the notes on this page, so point me at whatever is not landing.`,
    },
  ])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [used, setUsed] = useState(0)
  const [cap, setCap] = useState(FREE_QUESTIONS)
  const [isPro, setIsPro] = useState(false)

  const endRef = useRef<HTMLDivElement>(null)

  /* The allowance is per lesson, so it is only worth reading once the panel opens. */
  useEffect(() => {
    if (!open) return
    const load = async () => {
      const user = auth.currentUser
      if (!user) return
      try {
        const snap = await getDoc(doc(db, "users", user.uid))
        if (!snap.exists()) return
        const data = snap.data()
        const pro = isProUser(data)
        setIsPro(pro)
        setCap(pro ? PRO_QUESTIONS : FREE_QUESTIONS)
        const usage = data.aiUsage?.[lessonId]
        setUsed(typeof usage === "number" ? usage : 0)
      } catch (err) {
        console.error("Failed to load your tutor allowance:", err)
      }
    }
    load()
  }, [open, lessonId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" })
  }, [messages, sending])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const send = async () => {
    const question = input.trim()
    if (!question || sending || used >= cap) return

    const user = auth.currentUser
    if (!user) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Your session has expired — sign in again and I can pick this up." },
      ])
      return
    }

    setInput("")
    setMessages((prev) => [...prev, { role: "user", text: question }])
    setSending(true)
    try {
      const idToken = await user.getIdToken()
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ topicTitle, subject, content, userMessage: question }),
      })
      const data = await res.json()
      if (!res.ok || !data.reply) throw new Error(data.error || "No answer came back.")

      setMessages((prev) => [...prev, { role: "ai", text: data.reply as string }])
      setUsed((count) => count + 1)
      // One field, resolved on the server, so other lessons keep their own counts.
      await updateDoc(doc(db, "users", user.uid), new FieldPath("aiUsage", lessonId), increment(1))
    } catch (err) {
      console.error("The tutor could not answer:", err)
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text:
            err instanceof Error
              ? err.message
              : "Something went wrong on my end. Try asking again in a moment.",
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const left = Math.max(cap - used, 0)

  /* Sits above the mobile tab bar, which the app shell leaves room for. */
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary fixed bottom-24 right-4 z-40 shadow-lg sm:bottom-6 sm:right-6"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Ask the tutor
      </button>
    )
  }

  return (
    <aside
      aria-label="AI tutor"
      className="animate-fade-in-up fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col border-t border-hairline bg-surface-raised sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[34rem] sm:w-[24rem] sm:rounded-2xl sm:border sm:shadow-xl"
    >
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Sparkles size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-body-sm font-semibold text-foreground">AI tutor</p>
            <p className="text-caption tabular-nums text-muted">
              {left} of {cap} questions left on this lesson
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close the tutor"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div
        role="log"
        aria-live="polite"
        className="flex-1 space-y-3 overflow-y-auto bg-surface-sunken px-4 py-4"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
          >
            <p
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-body-sm leading-relaxed",
                message.role === "user"
                  ? "rounded-br-md bg-accent text-white dark:text-ink-950"
                  : "rounded-bl-md border border-hairline bg-surface text-muted",
              )}
            >
              {renderText(message.text)}
            </p>
          </div>
        ))}

        {sending && (
          <p className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-hairline bg-surface px-3.5 py-2.5 text-body-sm text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Thinking…
          </p>
        )}

        <div ref={endRef} />
      </div>

      <div className="border-t border-hairline px-4 py-3">
        {left === 0 ? (
          <div className="rounded-lg border border-hairline bg-surface-sunken px-3.5 py-3 text-center">
            <Lock size={16} className="mx-auto text-subtle" aria-hidden="true" />
            <p className="mt-1.5 text-caption font-semibold text-foreground">
              That is all {cap} questions on this lesson.
            </p>
            {isPro ? (
              <p className="mt-1 text-caption text-muted">
                Open another lesson and the allowance starts again.
              </p>
            ) : (
              <Link href="/app/upgrade" className="btn-primary btn-sm mt-3">
                Get {PRO_QUESTIONS} a lesson with Pro
              </Link>
            )}
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <label htmlFor="tutor-question" className="sr-only">
              Your question
            </label>
            <textarea
              id="tutor-question"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
              rows={1}
              maxLength={500}
              placeholder={`Ask about ${topicTitle}…`}
              className="input-premium max-h-28 resize-none py-2.5"
            />
            <button
              type="button"
              onClick={send}
              disabled={!input.trim() || sending}
              aria-label="Send your question"
              className="btn-primary shrink-0 px-3"
            >
              <Send size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}





