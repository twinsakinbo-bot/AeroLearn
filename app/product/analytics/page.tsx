import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Activity, Coins, Flame, Gauge, TrendingUp, Trophy } from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Section, SectionHeading } from "@/components/ui/section"

export const metadata: Metadata = {
  title: "Progress analytics",
  description:
    "AeroLearn ranks your weakest topics by accuracy and by pace, tracks streaks and XP, and tells you which topic to open next.",
  alternates: { canonical: "/product/analytics" },
}

/** Decorative bar heights for the faux chart, in percent. */
const BARS = [42, 58, 34, 76, 51, 88, 82]

const TOPICS = [
  { topic: "Calculus", label: "Losing marks", width: "w-1/4", tone: "danger" as const },
  { topic: "Statistics", label: "Slow but right", width: "w-3/5", tone: "warn" as const },
  { topic: "Algebra", label: "Solid", width: "w-11/12", tone: "success" as const },
]

const TONE_TEXT = {
  danger: "text-danger",
  warn: "text-warn",
  success: "text-success",
}

const TONE_FILL = {
  danger: "bg-danger",
  warn: "bg-warn",
  success: "bg-success",
}

const FEATURES = [
  {
    icon: Activity,
    title: "Weak topics, ranked",
    body: "Every answer is tagged to a syllabus topic. Accuracy is aggregated per topic and sorted worst first, so revision starts with the marks you are actually losing.",
  },
  {
    icon: Gauge,
    title: "Pace, tracked separately",
    body: "A question you get right in three minutes is not safe, because you do not get three minutes. Slow-but-right topics are surfaced on their own.",
  },
  {
    icon: Flame,
    title: "Streaks and XP",
    body: "A daily streak, XP per session and AeroCoins you can spend in the store. Habit does more for a grade over a term than any single study weekend.",
  },
  {
    icon: Trophy,
    title: "Leaderboard and levels",
    body: "Weekly leaderboards, levels and titles for students who like a scoreboard. Entirely optional — it can be ignored without losing anything.",
  },
]

const RELATED = [
  {
    href: "/product/learning",
    title: "Lessons",
    body: "The syllabus, in the order it makes sense.",
  },
  {
    href: "/product/practice",
    title: "Practice & mocks",
    body: "Past questions and timed CBT papers.",
  },
]

export default function AnalyticsProductPage() {
  return (
    <MarketingShell>
      <Section size="lg">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="badge-accent">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              Progress
            </span>
            <h1 className="mt-6 text-display text-foreground sm:text-display-lg">
              A score is a verdict. This is a plan.
            </h1>
            <p className="mt-5 max-w-lg text-body-lg text-muted">
              Twenty-eight out of forty tells you nothing about what to do tomorrow. AeroLearn ranks
              your topics by the marks they cost you and by how long they take, then names the one to
              open next.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/auth/signup" className="btn-primary btn-lg">
                See your stats
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/pricing" className="btn-secondary btn-lg">
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-caption text-subtle">
              Basic shows overall progress and streaks. Weak-topic breakdowns are part of Pro.
            </p>
          </div>

          {/* Faux dashboard — decorative, so it carries no semantics. */}
          <div className="relative" aria-hidden="true">
            <div className="card-glass p-7">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-sunken px-3 py-1 text-caption font-semibold text-foreground">
                  <Flame className="h-3.5 w-3.5 text-streak" />
                  14-day streak
                </span>
              </div>

              <div className="mt-6 flex items-end justify-between">
                <div>
                  <p className="text-overline uppercase text-subtle">Accuracy this week</p>
                  <p className="font-display text-display text-foreground tabular-nums">82%</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-caption font-semibold text-success">
                  <TrendingUp className="h-3.5 w-3.5" />
                  +5
                </span>
              </div>

              <div className="mt-7 flex h-28 items-end gap-2.5">
                {BARS.map((height, i) => (
                  <div
                    key={i}
                    className={`w-full rounded-t ${i === BARS.length - 1 ? "bg-accent" : "bg-accent/25"}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>

              <div className="mt-7 space-y-3 border-t border-hairline pt-6">
                {TOPICS.map((row) => (
                  <div key={row.topic}>
                    <div className="flex items-center justify-between text-caption font-semibold">
                      <span className="text-foreground">{row.topic}</span>
                      <span className={TONE_TEXT[row.tone]}>{row.label}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div className={`h-full ${row.width} ${TONE_FILL[row.tone]}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-invert absolute -bottom-7 -left-6 hidden items-center gap-3.5 p-5 sm:flex">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-coin/20 text-coin">
                <Coins className="h-5 w-5" />
              </span>
              <div>
                <p className="text-body-sm font-semibold text-white">+120 AeroCoins</p>
                <p className="text-caption text-ink-400">Spend them in the store.</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="sunken" className="border-y border-hairline">
        <SectionHeading
          eyebrow="What we measure"
          title="Four signals, one instruction"
          lede="Everything here exists to answer a single question: which topic do I open next? Anything that does not help answer it stays out."
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
          <h3 className="text-h4 text-foreground">What it will not do</h3>
          <p className="mt-2.5 max-w-prose text-body-sm text-muted">
            Predict your grade. Nobody can do that honestly, and a fake number would only teach you to
            distrust the rest of the app. You get the ranked list and the reasons behind it.
          </p>
        </div>
      </Section>

      <Section size="lg">
        <div className="card-invert p-8 sm:p-12">
          <div className="max-w-xl">
            <h2 className="text-h2 text-white">Find out where the marks are going</h2>
            <p className="mt-3.5 text-body text-ink-300">
              One practice set is enough to start the picture. By the third one it is telling you
              something you did not already know.
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
