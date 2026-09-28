import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowLeft, CheckCircle2, MonitorPlay, ShieldQuestion } from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Container } from "@/components/ui/container"

import { AutoDownload } from "./auto-download"

export const metadata: Metadata = {
  title: "Download starting",
  description: "Your AeroLearn download is starting, with installation steps for Windows.",
  alternates: { canonical: "/download/thank-you" },
  robots: { index: false, follow: true },
}

const STEPS = [
  {
    title: "Open the installer",
    body: "When the download finishes, run AeroLearn-Setup.exe from your browser's download bar or your Downloads folder.",
  },
  {
    title: "Let Windows through",
    body: "SmartScreen warns about installers it has not seen often. Choose More info, then Run anyway.",
  },
  {
    title: "Sign in",
    body: "The setup takes a few seconds and AeroLearn opens on its own. Sign in with your existing account and your progress is already there.",
  },
]

export default function DownloadThankYouPage() {
  return (
    <MarketingShell>
      <section className="section-lg">
        <Container narrow>
          <div className="text-center">
            <Suspense
              fallback={
                <>
                  <span className="skeleton mx-auto block h-16 w-16 rounded-xl" />
                  <h1 className="mt-7 text-h1 text-foreground sm:text-display">
                    Starting your download…
                  </h1>
                </>
              }
            >
              <AutoDownload />
            </Suspense>
          </div>

          <div className="card mt-14 p-7 sm:p-9">
            <h2 className="flex items-center gap-3 text-h3 text-foreground">
              <MonitorPlay className="h-5 w-5 text-accent" aria-hidden="true" />
              Installing on Windows
            </h2>

            <ol className="mt-8 space-y-7">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-sunken font-display text-body-sm font-semibold text-accent"
                    aria-hidden="true"
                  >
                    {i === STEPS.length - 1 ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </span>
                  <div>
                    <h3 className="text-h4 text-foreground">{step.title}</h3>
                    <p className="mt-1.5 text-body-sm text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="card mt-5 flex items-start gap-4 p-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
              <ShieldQuestion className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-h4 text-foreground">Something went wrong?</h2>
              <p className="mt-1.5 text-body-sm text-muted">
                Write to{" "}
                <a href="mailto:support@aerolearn.name.ng" className="link-inline">
                  support@aerolearn.name.ng
                </a>{" "}
                with the version number and what Windows said, and we will get back to you the same
                working day.
              </p>
            </div>
          </div>

          <div className="mt-10">
            <Link href="/download" className="link-quiet inline-flex items-center gap-2 text-body-sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              All versions
            </Link>
          </div>
        </Container>
      </section>
    </MarketingShell>
  )
}
