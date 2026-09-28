import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Maintenance",
  robots: { index: false, follow: false },
}

export default function MaintenancePage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-16 text-foreground">
      {/* Decorative background orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full opacity-[0.06]"
        style={{ backgroundColor: "rgb(var(--color-brand))" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -bottom-40 h-96 w-96 rounded-full opacity-[0.05]"
        style={{ backgroundColor: "rgb(var(--color-accent))" }}
      />

      <div className="relative max-w-lg text-center">
        {/* Icon badge */}
        <div
          className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "rgb(var(--color-brand) / 0.1)" }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgb(var(--color-brand))"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-9 w-9"
            aria-hidden
          >
            <path d="M2 10h13V5a3 3 0 0 1 6 0v0a3 3 0 0 1-3 3" />
            <path d="M2 10h2.5l2.5 9a3 3 0 0 0 2.9 2.2H12M18 10v1a2 2 0 0 1-2 2v-3" />
            <path d="M20 10 9.5 22" />
          </svg>
        </div>

        <h1 className="font-display text-3xl font-black tracking-tight text-foreground sm:text-4xl">
          We&rsquo;re doing some maintenance
        </h1>

        <p className="mx-auto mt-4 max-w-md text-body-lg leading-relaxed text-muted">
          AeroLearn is temporarily offline while we update our systems to serve
          you better. Please check back shortly &mdash; your progress and data
          will be waiting for you.
        </p>

        <div
          className="mx-auto mt-8 flex items-center justify-center gap-3 rounded-2xl px-6 py-4"
          style={{ backgroundColor: "rgb(var(--color-surface))" }}
        >
          <span
            className="relative flex h-3 w-3"
            aria-hidden
          >
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ backgroundColor: "rgb(var(--color-accent))" }}
            />
            <span
              className="relative inline-flex h-3 w-3 rounded-full"
              style={{ backgroundColor: "rgb(var(--color-accent))" }}
            />
          </span>
          <p className="text-body-sm font-bold text-muted">
            Maintenance in progress &mdash; thanks for your patience
          </p>
        </div>

        <p className="mt-10 text-body-sm text-subtle">
          Questions? Reach out at{" "}
          <a
            href="mailto:contact@aerolearn.name.ng"
            className="font-bold text-brand underline decoration-brand/40 underline-offset-4 transition-colors hover:text-accent"
          >
            contact@aerolearn.name.ng
          </a>
        </p>
      </div>
    </main>
  )
}
