"use client"

import { useState } from "react"
import { CheckCircle2, Send } from "lucide-react"

import { Input } from "@/components/ui/input"

type Status = { state: "idle" | "sending" | "sent" } | { state: "error"; message: string }

export function ContactForm() {
  const [status, setStatus] = useState<Status>({ state: "idle" })

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    setStatus({ state: "sending" })

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        setStatus({
          state: "error",
          message: payload.error ?? "We couldn't send that. Please try again.",
        })
        return
      }

      form.reset()
      setStatus({ state: "sent" })
    } catch {
      setStatus({
        state: "error",
        message: "Network error — check your connection and try again.",
      })
    }
  }

  if (status.state === "sent") {
    return (
      <div className="card flex flex-col items-center p-8 text-center sm:p-10">
        <CheckCircle2 className="h-9 w-9 text-success" aria-hidden="true" />
        <h2 className="mt-4 text-h3 text-foreground">Message sent</h2>
        <p className="mt-2 max-w-sm text-body-sm text-muted">
          Thanks — we've got it. You'll usually hear back within one working day.
        </p>
        <button
          type="button"
          onClick={() => setStatus({ state: "idle" })}
          className="btn-secondary btn-sm mt-6"
        >
          Send another
        </button>
      </div>
    )
  }

  const sending = status.state === "sending"

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6 sm:p-8" noValidate>
      <h2 className="text-h3 text-foreground">Send a message</h2>

      <Input name="name" label="Your name" autoComplete="name" required placeholder="Ada Obi" />
      <Input
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        placeholder="ada@example.com"
        hint="We'll reply to this address."
      />
      <Input name="subject" label="Subject" placeholder="Trouble with my subscription" />

      <div>
        <label htmlFor="contact-message" className="field-label">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          maxLength={4000}
          placeholder="Tell us what's going on…"
          className="input-premium resize-y"
        />
      </div>

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-company">Company</label>
        <input id="contact-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      {status.state === "error" && (
        <p className="field-error" role="alert">
          {status.message}
        </p>
      )}

      <button type="submit" className="btn-primary btn-block" disabled={sending}>
        {sending ? "Sending…" : "Send message"}
        {!sending && <Send className="h-4 w-4" aria-hidden="true" />}
      </button>

      <p className="text-caption text-subtle">
        We only use your details to reply. Nothing is added to a mailing list.
      </p>
    </form>
  )
}
