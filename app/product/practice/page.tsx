import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Clock, Database, Filter, ListChecks, Target, Timer } from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Section, SectionHeading } from "@/components/ui/section"

export const metadata: Metadata = {
  title: "Practice & mock exams",
  description:
    "WAEC, NECO and JAMB past questions with worked solutions, plus timed mock papers in a CBT layout that matches the real thing.",
  alternates: { canonical: "/product/practice" },
}

const YEARS = ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019"]

const FEATURES = [
  {
    icon: Database,
    title: "Past questions, by the decade",
    body: "WAEC, NECO and JAMB papers going back years, tagged to topic and year so you can drill one thing at a time instead of shuffling a whole paper.",
  },
  {
    icon: ListChecks,
    title: "Solutions, not just answers",
    body: "Every question carries the working. When you get one wrong you find out which step you missed, which is the only part that transfers to the next question.",
  },
  {
    icon: Timer,
    title: "Mocks that run on the clock",
    body: "Full-length papers, correct question count, timer on screen, no pausing. The point is to find out what your pace does to your accuracy.",
  },
  {
    icon: Filter,
    title: "Sessions you build yourself",
    body: "Filter by subject, topic, year or difficulty. Twenty questions on circle theorems, right now, is two taps away.",
  },
]

const RELATED = [
  {
    href: "/product/learning",
    title: "Lessons",
    body: "The syllabus, in the order it makes sense.",
  },
  {
    href: "/product/analytics",
    title: "Progress analytics",
    body: "See which topics are costing you marks.",
  },
]

export default function PracticeProductPage() {
  return (
    <MarketingShell>
      <Section size="lg">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="badge-accent">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              Practice &amp; mocks
            </span>
            <h1 className="mt-6 text-display text-foreground sm:text-display-lg">
              Practise in the format you will sit
            </h1>
            <p className="mt-5 max-w-lg text-body-lg text-muted">
              Past questions are the most accurate practice material that exists. Ours come with the
              working shown, and the mock papers run on a clock in a CBT layout — because pace is a
              separate skill from knowing the answer.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/auth/signup" className="btn-primary btn-lg">
                Start practising free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/pricing" className="btn-secondary btn-lg">
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-caption text-subtle">
              Basic includes daily practice. Unlimited mocks are part of Pro.
            </p>
          </div>

          {/* Faux CBT screen — decorative, so it carries no semantics. */}
          <div className="relative" aria-hidden="true">
            <div className="card-glass p-7">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
                  <Clock className="h-5 w-5" />
                </span>
                <div className="text-right">
                  <p className="text-overline uppercase text-subtle">Time left</p>
                  <p className="font-display text-h4 tabular-nums text-danger">45:12</p>
                </div>
              </div>

              <div className="mt-7 space-y-2">
                <div className="bar-mock h-3 w-24" />
                <div className="bar-mock h-5 w-full bg-surface-hover" />
                <div className="bar-mock h-5 w-4/5 bg-surface-hover" />
              </div>

              <div className="mt-7 space-y-2.5">
                <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-3.5">
                  <span className="h-4 w-4 rounded-full border border-hairline" />
                  <span className="bar-mock h-2.5 w-1/2" />
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-accent/45 bg-accent/10 px-4 py-3.5">
                  <span className="h-4 w-4 rounded-full border-4 border-accent" />
                  <span className="h-2.5 w-3/5 rounded bg-accent/40" />
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-3.5">
                  <span className="h-4 w-4 rounded-full border border-hairline" />
                  <span className="bar-mock h-2.5 w-2/3" />
                </div>
              </div>

              <div className="mt-7 flex items-center justify-between">
                <p className="text-caption text-subtle">Question 12 of 40</p>
                <span className="btn-primary btn-sm">Next</span>
              </div>
            </div>

            <div className="card-invert absolute -bottom-7 -right-5 hidden p-5 sm:block">
              <p className="font-display text-h3 text-white">10,000+</p>
              <p className="text-caption text-ink-400">Past questions</p>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="sunken" className="border-y border-hairline">
        <SectionHeading
          eyebrow="What you get"
          title="Train the exam, not the topic list"
          lede="Knowing the material and sitting the paper are two different jobs. Practice mode exists for the second one."
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

        <div className="card mt-10 p-7">
          <h3 className="text-h4 text-foreground">Papers in the library</h3>
          <p className="mt-2 max-w-prose text-body-sm text-muted">
            Coverage varies by subject; the core subjects go back furthest.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {YEARS.map((year) => (
              <li
                key={year}
                className="rounded-md border border-hairline bg-surface-sunken px-3 py-1.5 text-caption font-semibold tabular-nums text-muted"
              >
                {year}
              </li>
            ))}
            <li className="rounded-md border border-hairline bg-surface-sunken px-3 py-1.5 text-caption font-semibold text-subtle">
              earlier
            </li>
          </ul>
        </div>
      </Section>

      <Section size="lg">
        <div className="card-invert p-8 sm:p-12">
          <div className="max-w-xl">
            <h2 className="text-h2 text-white">Sit one paper before you revise anything</h2>
            <p className="mt-3.5 text-body text-ink-300">
              It is the fastest way to turn a syllabus into a ranked list of your actual weak topics.
              Takes an hour, changes the whole month.
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
