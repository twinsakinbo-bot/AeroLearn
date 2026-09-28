import Link from "next/link"

import { Logo } from "@/components/ui/logo"
import { ThemeToggle } from "@/components/ui/theme-toggle"

/**
 * Centred card layout shared by sign-in, sign-up and the email-action page.
 * Keeps the auth screens visually identical without each one re-deriving the
 * same wrapper.
 */
export function AuthShell({
  title,
  lede,
  children,
  footer,
  eyebrow,
  wide = false,
}: {
  title: string
  lede?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  /** Sits above the heading — the sign-up wizard puts its step rail here. */
  eyebrow?: React.ReactNode
  /** Sign-up needs a little more room than sign-in. */
  wide?: boolean
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-14">
      {/* Ambient wash. Decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-accent/10 blur-[120px]"
      />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <Link
        href="/"
        className="z-10 rounded-md focus-visible:outline-none"
        aria-label="AeroLearn home"
      >
        <Logo size="md" />
      </Link>

      <main
        id="main"
        className={`card z-10 mt-8 w-full ${wide ? "max-w-lg" : "max-w-[27rem]"} animate-fade-in-up p-7 sm:p-9`}
      >
        {eyebrow && <div className="mb-6">{eyebrow}</div>}
        <h1 className="text-h2 text-foreground">{title}</h1>
        {lede && <p className="mt-2 text-body-sm text-muted">{lede}</p>}
        <div className="mt-7">{children}</div>
      </main>

      {footer && <div className="z-10 mt-7 text-center text-body-sm text-muted">{footer}</div>}
    </div>
  )
}

/** Google's mark, used on the federated sign-in buttons. */
export function GoogleMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.03 2.53-2.16 3.31v2.77h3.49c2.04-1.88 3.24-4.64 3.24-7.99z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-1 7.28-2.69l-3.49-2.77c-.99.66-2.25 1.06-3.79 1.06-2.91 0-5.37-1.96-6.25-4.63H2.18v2.84C3.99 20.53 7.66 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.75 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.66 1 3.99 3.47 2.18 7.07l3.57 2.77c.88-2.67 3.34-4.46 6.25-4.46z"
        fill="#EA4335"
      />
    </svg>
  )
}

/** "or" rule between the email form and the federated button. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-7 flex items-center gap-4" aria-hidden="true">
      <span className="h-px flex-1 bg-hairline" />
      <span className="text-overline uppercase text-subtle">{label}</span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  )
}
