"use client"

import { useEffect, useState } from "react"
import { X, Sparkles, ArrowRight } from "lucide-react"
import Link from "next/link"

export function ExitIntentPopup() {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check if user already dismissed today
    const lastDismissed = localStorage.getItem("exitIntentDismissed")
    if (lastDismissed) {
      const timeSince = Date.now() - parseInt(lastDismissed)
      if (timeSince < 24 * 60 * 60 * 1000) {
        setDismissed(true)
        return
      }
    }

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !show && !dismissed) {
        setShow(true)
      }
    }

    // Only trigger after user has been on page for 10 seconds
    const timer = setTimeout(() => {
      document.addEventListener("mouseleave", handleMouseLeave)
    }, 10000)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [show, dismissed])

  const handleDismiss = () => {
    setShow(false)
    setDismissed(true)
    localStorage.setItem("exitIntentDismissed", Date.now().toString())
  }

  if (!show || dismissed) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative mx-4 w-full max-w-lg animate-scale-in rounded-2xl border border-hairline bg-surface p-8 shadow-2xl">
        <button
          onClick={handleDismiss}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-accent">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <span className="text-overline font-bold uppercase">Wait!</span>
        </div>

        <h2 className="mt-3 text-h2 text-foreground">Before you go...</h2>
        <p className="mt-3 text-body text-muted">
          Start learning today and get your <strong className="text-foreground">first 50 practice questions free</strong>. 
          No credit card required.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/auth/signup"
            className="btn-primary flex-1"
            onClick={handleDismiss}
          >
            Start learning free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button
            onClick={handleDismiss}
            className="btn-secondary flex-1"
          >
            Maybe later
          </button>
        </div>

        <p className="mt-4 text-center text-caption text-muted">
          Join 2,847+ students preparing for WAEC, NECO & JAMB
        </p>
      </div>
    </div>
  )
}
