"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Activity,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronRight,
  Flame,
  Sparkles,
  Target,
  Trophy,
  X as XIcon,
} from "lucide-react"
import { auth, onAuthStateChanged } from "@/lib/auth"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Container } from "@/components/ui/container"
import { Section, SectionHeading } from "@/components/ui/section"
import { SITE_URL, siteUrl } from "@/lib/site"
import { cn } from "@/lib/utils"
import { WhatsAppButton } from "@/components/marketing/whatsapp-button"
import { ExitIntentPopup } from "@/components/marketing/exit-intent-popup"
import { ExamCountdown } from "@/components/marketing/exam-countdown"
import { PublicLeaderboard } from "@/components/marketing/public-leaderboard"
import { EnhancedDemoQuiz } from "@/components/marketing/enhanced-demo-quiz"

const DEMO_QUESTIONS = [
  {
    subject: "JAMB · Mathematics",
    question: "If a polynomial p(x) is divided by (x − a), the remainder is…",
    options: ["p(a)", "−p(a)", "a", "0"],
    correct: 0,
    explanation: "By the Remainder Theorem, dividing p(x) by (x − a) leaves p(a).",
  },
  {
    subject: "WAEC · Chemistry",
    question: "Which of the following is an inert gas?",
    options: ["Chlorine", "Nitrogen", "Argon", "Oxygen"],
    correct: 2,
    explanation: "Argon is a noble gas — a full outer shell makes it chemically inert.",
  },
] as const

const STATS = [
  { value: "JSS1–SS3", label: "Every class, every core subject" },
  { value: "3 exams", label: "WAEC, NECO and JAMB practice" },
  { value: "₦2,500", label: "Per month for all of it" },
]

const STEPS = [
  {
    step: "01",
    title: "Tell us your class and subjects",
    body: "Pick your class and the subjects you're sitting. AeroLearn builds the syllabus around that, so nothing on your screen is irrelevant.",
  },
  {
    step: "02",
    title: "Learn a topic, then prove it",
    body: "Read the lesson, then answer real past questions on the same topic while it's fresh. Every wrong answer comes with a worked explanation.",
  },
  {
    step: "03",
    title: "Sit full mocks under the clock",
    body: "Timed papers in the CBT layout you'll meet on exam day, then a breakdown of which topics cost you the most marks.",
  },
]

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "AeroLearn",
  url: SITE_URL,
  logo: siteUrl("/aerolearn_logo.svg"),
  description:
    "AeroLearn is a learning platform for Nigerian secondary school students preparing for WAEC, NECO and JAMB.",
  knowsAbout: ["WAEC", "NECO", "JAMB", "Secondary School Education", "Nigerian Curriculum"],
}

export default function LandingPage() {
  const [signedIn, setSignedIn] = useState(false)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => onAuthStateChanged(auth, (user) => setSignedIn(Boolean(user))), [])

  const question = DEMO_QUESTIONS[index]
  const answered = selected !== null

  const nextQuestion = () => {
    setSelected(null)
    setIndex((prev) => (prev + 1) % DEMO_QUESTIONS.length)
  }

  return (
    <MarketingShell>
      <WhatsAppButton />
      <ExitIntentPopup />
      <ExamCountdown />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <section className="relative overflow-hidden pb-16 pt-14 sm:pb-24 sm:pt-20 lg:pb-32 lg:pt-24">
        <Container>
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div className="animate-fade-in-up text-center lg:text-left">
              <span className="badge-accent mx-auto lg:mx-0">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Built for WAEC, NECO &amp; JAMB
              </span>

              <h1 className="mt-6 text-display sm:text-display-lg lg:text-display-xl">
                Master your subjects.
                <br />
                <span className="text-gradient">Ace your exams.</span>
              </h1>

              <p className="mx-auto mt-5 max-w-xl text-body-lg text-muted lg:mx-0">
                The full JSS1–SS3 curriculum, thousands of real past questions and timed mock
                exams — in one app that tells you exactly what to study next.
              </p>

              <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
                <Link href={signedIn ? "/app" : "/auth/signup"} className="btn-primary btn-lg">
                  {signedIn ? "Go to dashboard" : "Start learning free"}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/download" className="btn-secondary btn-lg">
                  <svg viewBox="0 0 87.6 87.6" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
                    <path d="M0 12.5l35.7-4.9v35.3H0V12.5zm39.6-5.5L87.6 0v43H39.6V7zm0 40h48v40.6L39.6 82.1v-35.1zm-39.6 0h35.7v30L0 74.2v-27.2z" />
                  </svg>
                  Download for Windows
                </Link>
              </div>

              <dl className="mt-12 grid grid-cols-3 gap-6 border-t border-hairline pt-6 text-left">
                {STATS.map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-h4 font-bold text-foreground">{stat.value}</dt>
                    <dd className="mt-1 text-caption text-muted">{stat.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="relative mx-auto w-full max-w-md animate-scale-in lg:max-w-none">
              <EnhancedDemoQuiz />

              <div className="card-invert absolute -bottom-8 -right-4 hidden w-60 p-4 sm:block lg:-right-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-700 to-accent-500 text-white">
                    <BrainCircuit className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-overline uppercase text-accent-300">AI tutor</p>
                    <p className="mt-1 text-caption leading-relaxed text-ink-300">
                      Stuck on a step? Ask, and get it explained line by line.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <Section id="features" tone="sunken" className="border-t border-hairline">
        <SectionHeading
          eyebrow="What you get"
          title="Everything you need. Nothing you don't."
          lede="Lessons, past questions, mocks and progress tracking that actually talks to each other — instead of four apps that don't."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          <article className="card md:col-span-2 flex flex-col overflow-hidden p-7 sm:p-9">
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-brand">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="text-h3 text-foreground">The whole curriculum, in order</h3>
            <p className="mt-3 max-w-md text-body text-muted">
              Structured lessons for every core subject from JSS1 to SS3, written to the Nigerian
              syllabus and sequenced so each topic builds on the last.
            </p>
            <Link href="/product/learning" className="link mt-5 inline-flex items-center gap-1.5">
              Explore the curriculum
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <div className="mt-8 space-y-2 rounded-t-lg border-x border-t border-hairline bg-surface-sunken p-4">
              <div className="bar-mock h-3.5 w-32" />
              <div className="bar-mock h-2 w-full" />
              <div className="bar-mock h-2 w-5/6" />
              <div className="bar-mock h-2 w-4/6" />
            </div>
          </article>

          <article className="card flex flex-col p-7">
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
              <Activity className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="text-h3 text-foreground">Know your weak topics</h3>
            <p className="mt-3 text-body text-muted">
              Every answer feeds a picture of where your marks are leaking, so revision starts with
              the topic that costs you most.
            </p>
            <div className="mt-auto flex h-28 items-end gap-1.5 pt-8">
              {[40, 62, 34, 78, 52, 88, 70].map((height, i) => (
                <div
                  key={i}
                  className="w-full rounded-t bg-accent/25"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </article>

          <article className="card relative flex flex-col overflow-hidden p-7">
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-warn">
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="text-h3 text-foreground">Reasons to come back</h3>
            <p className="mt-3 text-body text-muted">
              Daily streaks, XP and Aero Coins you can spend in the store. Consistency is the part
              most students lose — this is the part that fixes it.
            </p>
            <Flame
              className="pointer-events-none absolute -bottom-6 -right-6 h-40 w-40 text-warn/10"
              aria-hidden="true"
            />
          </article>

          <article className="card md:col-span-2 flex flex-col gap-8 p-7 sm:p-9 md:flex-row md:items-center">
            <div className="flex-1">
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-brand">
                <Target className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-h3 text-foreground">Real past questions, real conditions</h3>
              <p className="mt-3 text-body text-muted">
                WAEC, NECO and JAMB papers in the CBT layout you'll sit, with worked solutions the
                moment you submit — not a score and nothing else.
              </p>
              <Link href="/product/practice" className="link mt-5 inline-flex items-center gap-1.5">
                See how practice works
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="w-full shrink-0 rounded-lg border border-hairline bg-surface-sunken p-4 md:w-60">
              <div className="bar-mock h-2.5 w-16" />
              <div className="bar-mock mt-3 h-3 w-full" />
              <div className="bar-mock mt-1.5 h-3 w-4/5" />
              <div className="mt-4 space-y-2">
                <div className="h-9 rounded-md border border-hairline bg-surface" />
                <div className="h-9 rounded-md border border-accent/35 bg-accent/10" />
                <div className="h-9 rounded-md border border-hairline bg-surface" />
              </div>
            </div>
          </article>
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="How it works"
          title="Three steps, then just keep going"
          lede="No setup weekend. You can be answering a real past question within two minutes of signing up."
        />

        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map((item) => (
            <li key={item.step} className="card p-7">
              <span className="text-overline uppercase text-accent">{item.step}</span>
              <h3 className="mt-3 text-h4 text-foreground">{item.title}</h3>
              <p className="mt-2.5 text-body-sm text-muted">{item.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="sunken" className="border-y border-hairline">
        <Container>
          <div className="mx-auto max-w-2xl text-center mb-12">
            <span className="badge-accent mx-auto">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              Leaderboard
            </span>
            <h2 className="mt-6 text-h2 text-foreground sm:text-display">
              Join thousands of students competing
            </h2>
            <p className="mt-4 text-body-lg text-muted">
              See where you rank against students across Nigeria preparing for the same exams.
            </p>
          </div>
          <PublicLeaderboard />
        </Container>
      </Section>

      <Section tone="sunken" className="border-y border-hairline">
        <SectionHeading
          eyebrow="Pricing"
          title="Less than one textbook a month"
          lede="Start free, for as long as you like. Upgrade when you want every subject and unlimited practice."
        />

        <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
          <div className="card flex flex-col p-8">
            <h3 className="text-h3 text-foreground">Basic</h3>
            <p className="mt-1.5 text-body-sm text-muted">For getting a feel for the platform.</p>
            <p className="mt-7 flex items-baseline gap-2">
              <span className="text-display font-bold text-foreground">Free</span>
              <span className="text-caption font-semibold uppercase tracking-wider text-subtle">
                forever
              </span>
            </p>
            <ul className="mt-8 flex-1 space-y-3.5">
              {["Access to 2 subjects", "A limited set of practice questions", "Community support"].map(
                (item) => (
                  <li key={item} className="flex items-start gap-3 text-body-sm text-muted">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    {item}
                  </li>
                ),
              )}
            </ul>
            <Link href="/auth/signup" className="btn-secondary btn-block mt-8">
              Get started free
            </Link>
          </div>

          <div className="card-invert relative flex flex-col p-8">
            <span className="badge border-accent-400/30 bg-accent-400/15 text-accent-300 self-start">
              Recommended
            </span>
            <h3 className="mt-4 text-h3 text-white">Pro</h3>
            <p className="mt-1.5 text-body-sm text-ink-400">Everything, with nothing locked off.</p>
            <p className="mt-7 flex items-baseline gap-2">
              <span className="text-display font-bold text-white">₦2,500</span>
              <span className="text-caption font-semibold uppercase tracking-wider text-ink-400">
                / month
              </span>
            </p>
            <ul className="mt-8 flex-1 space-y-3.5">
              {[
                "Every subject, JSS1 to SS3",
                "Unlimited WAEC, NECO and JAMB practice",
                "Full timed mock exams",
                "AI tutor and essay grading",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-body-sm text-ink-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/auth/signup"
              className="btn mt-8 w-full bg-accent-400 text-ink-950 hover:bg-accent-300"
            >
              Upgrade to Pro
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-caption text-muted">
          Want the full comparison?{" "}
          <Link href="/pricing" className="link-inline">
            See everything in each plan
          </Link>
          .
        </p>
      </Section>

      <Section>
        <div className="card-invert overflow-hidden px-7 py-14 text-center sm:px-12">
          <h2 className="mx-auto max-w-2xl text-h2 text-white sm:text-display">
            Your exam has a date. Start today.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-body-lg text-ink-300">
            Sign up free, pick your subjects, and answer your first past question in the next two
            minutes.
          </p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              href={signedIn ? "/app" : "/auth/signup"}
              className="btn btn-lg bg-accent-400 text-ink-950 hover:bg-accent-300"
            >
              {signedIn ? "Go to dashboard" : "Start learning free"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/pricing"
              className="btn btn-lg border border-white/15 text-ink-100 hover:bg-white/10"
            >
              Compare plans
            </Link>
          </div>
        </div>
      </Section>
    </MarketingShell>
  )
}

