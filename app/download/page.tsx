import type { Metadata } from "next"
import Link from "next/link"
import { Download, History, Info, Monitor } from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Section, SectionHeading } from "@/components/ui/section"

import { RELEASES } from "./releases"

export const metadata: Metadata = {
  title: "Download for Windows",
  description:
    "Download the AeroLearn desktop app for Windows. Lessons, past questions and mock exams, with your progress synced to your account.",
  alternates: { canonical: "/download" },
}

const REASONS = [
  "Opens in a window of its own, so revision is not one tab among thirty.",
  "Your progress, streak and XP are the same account as the web app.",
  "Practice sessions keep running through a brief drop in connection.",
]

export default function DownloadPage() {
  return (
    <MarketingShell>
      <Section size="lg">
        <SectionHeading
          eyebrow="Desktop app"
          title="AeroLearn on Windows"
          lede="The same platform as the web app, in its own window. Sign in with the account you already have — nothing is stored separately."
        />

        <div className="mx-auto mt-14 max-w-3xl space-y-4">
          {RELEASES.map((release, i) => {
            const isLatest = i === 0
            return (
              <article
                key={release.version}
                className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-4">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-hairline ${
                      isLatest
                        ? "bg-surface-sunken text-accent"
                        : "bg-surface-sunken text-subtle"
                    }`}
                  >
                    {isLatest ? (
                      <Monitor className="h-6 w-6" aria-hidden="true" />
                    ) : (
                      <History className="h-6 w-6" aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-h4 text-foreground">Version {release.version}</h2>
                      {isLatest && <span className="badge-accent">Latest</span>}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2.5 text-caption text-subtle">
                      <span>{release.date}</span>
                      <span aria-hidden="true">·</span>
                      <span>{release.size}</span>
                      <span aria-hidden="true">·</span>
                      <span>Windows 10 and 11</span>
                    </p>
                    <p className="mt-2 text-body-sm text-muted">{release.notes}</p>
                  </div>
                </div>

                <Link
                  href={`/download/thank-you?v=${encodeURIComponent(release.version)}`}
                  className={`${isLatest ? "btn-primary" : "btn-secondary"} shrink-0 justify-center`}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download
                  <span className="sr-only"> version {release.version}</span>
                </Link>
              </article>
            )
          })}
        </div>

        <div className="mx-auto mt-8 max-w-3xl">
          <div className="card flex items-start gap-4 p-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
              <Info className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-h4 text-foreground">Why the desktop app</h2>
              <ul className="mt-3 space-y-2">
                {REASONS.map((reason) => (
                  <li key={reason} className="flex gap-2.5 text-body-sm text-muted">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {reason}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-caption text-subtle">
                No Windows machine handy? The web app runs everything on any modern browser —{" "}
                <Link href="/auth/signup" className="link-inline">
                  start there instead
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </Section>
    </MarketingShell>
  )
}
