import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  Layers,
  PlayCircle,
  Sparkles,
} from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Section, SectionHeading } from "@/components/ui/section"

export const metadata: Metadata = {
  title: "Lessons",
  description:
    "Structured lessons for JSS1 to SS3, aligned to the NERDC curriculum. Worked examples, diagrams and end-of-lesson checks in every topic.",
  alternates: { canonical: "/product/learning" },
}

const SUBJECTS = ["Mathematics", "English Language", "Physics", "Chemistry", "Biology"]

const FEATURES = [
  {
    icon: Layers,
    title: "One path, not a pile of PDFs",
    body: "Each subject is broken into topics and each topic into short lessons, in the order they build on each other. You always know what comes next.",
  },
  {
    icon: CheckCircle2,
    title: "Worked examples, in full",
    body: "Every method is shown on a real question, line by line, with the reasoning for each step — not just the final answer.",
  },
  {
    icon: FileText,
    title: "A check at the end of every lesson",
    body: "Five to ten questions on the topic you just read. If you miss them, the lesson tells you which part to go back to.",
  },
  {
    icon: PlayCircle,
    title: "Diagrams where words fail",
    body: "Circle theorems, titration curves, cell division. The topics that need a picture get one, drawn for the syllabus rather than borrowed.",
  },
]

const RELATED = [
  {
    href: "/product/practice",
    title: "Practice & mocks",
    body: "Past questions and timed CBT papers.",
  },
  {
    href: "/product/analytics",
    title: "Progress analytics",
    body: "See which topics are costing you marks.",
  },
]

export default function LearningProductPage() {
  return (
    <MarketingShell>
      <Section size="lg">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="badge-accent">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Lessons
            </span>
            <h1 className="mt-6 text-display text-foreground sm:text-display-lg">
              The syllabus, in the order it makes sense
            </h1>
            <p className="mt-5 max-w-lg text-body-lg text-muted">
              Textbooks are written to be complete. Lessons should be written to be understood. Every
              topic from JSS1 to SS3 is broken into short lessons with the working shown in full.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/auth/signup" className="btn-primary btn-lg">
                Start learning free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/pricing" className="btn-secondary btn-lg">
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-caption text-subtle">
              No card required. Basic stays free for as long as you want it.
            </p>
          </div>

          <div className="relative">
            <div className="card-glass p-7">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
                  <BookOpen className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="badge-success">NERDC aligned</span>
              </div>
              <h2 className="mt-5 text-h3 text-foreground">JSS1 → SS3</h2>
              <p className="mt-2 text-body-sm text-muted">
                Core subjects mapped topic by topic against the national curriculum.
              </p>

              <ul className="mt-6 space-y-2.5">
                {SUBJECTS.map((subject, i) => (
                  <li
                    key={subject}
                    className="flex items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-sunken text-caption font-semibold text-muted">
                      {i + 1}
                    </span>
                    <span className="text-body-sm font-medium text-foreground">{subject}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card-invert absolute -bottom-7 -left-6 hidden items-center gap-3.5 p-5 sm:flex">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-500/20 text-accent-300">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-body-sm font-semibold text-white">Written by teachers</p>
                <p className="text-caption text-ink-400">Reviewed before it ships.</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="sunken" className="border-y border-hairline">
        <SectionHeading
          eyebrow="How the lessons work"
          title="Built to be finished, not admired"
          lede="Four things we insist on in every topic, because they are the four that decide whether a lesson actually changes a mark."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="card p-7">
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-h4 text-foreground">{title}</h3>
              <p className="mt-2.5 text-body-sm text-muted">{body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section size="lg">
        <div className="card-invert p-8 sm:p-12">
          <div className="max-w-xl">
            <h2 className="text-h2 text-white">Open the first lesson tonight</h2>
            <p className="mt-3.5 text-body text-ink-300">
              Pick a subject, sit the diagnostic, and the platform tells you which topic to start
              with. Nothing to install.
            </p>
          </div>
          <Link
            href="/auth/signup"
            className="btn btn-lg mt-8 bg-accent-400 text-ink-950 hover:bg-accent-300"
          >
            Create a free account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-14 grid gap-5 border-t border-hairline pt-10 sm:grid-cols-2">
          {RELATED.map((item) => (
            <Link key={item.href} href={item.href} className="card-interactive p-6">
              <h3 className="text-h4 text-foreground">{item.title}</h3>
              <p className="mt-2 text-body-sm text-muted">{item.body}</p>
              <span className="link mt-4 inline-flex items-center gap-1.5 text-body-sm">
                Read more
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </MarketingShell>
  )
}
