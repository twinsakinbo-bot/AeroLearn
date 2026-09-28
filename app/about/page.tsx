import type { Metadata } from "next"
import Link from "next/link"
import { Globe, Heart, Target } from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Section, SectionHeading } from "@/components/ui/section"

export const metadata: Metadata = {
  title: "About us",
  description:
    "AeroLearn builds learning tools for Nigerian secondary school students — the full JSS1–SS3 curriculum, past-question practice and timed mock exams.",
  alternates: { canonical: "/about" },
}

const PILLARS = [
  {
    icon: Target,
    title: "Our mission",
    body: "Give every Nigerian student the lessons, practice and feedback they need to walk into WAEC, NECO or JAMB knowing what to expect.",
  },
  {
    icon: Heart,
    title: "Our values",
    body: "Student-first design, honest pricing, and material we would be happy to put in front of a teacher. No filler, no dark patterns.",
  },
  {
    icon: Globe,
    title: "Our vision",
    body: "To be the study platform students reach for by default — on a laptop in a school lab or on a phone with patchy data.",
  },
]

export default function AboutPage() {
  return (
    <MarketingShell>
      <Section size="lg">
        <SectionHeading
          eyebrow="About AeroLearn"
          title="Built for the exam that decides the next five years"
          lede="Nigerian secondary school students sit some of the highest-stakes exams anywhere, often with textbooks that are out of date and past papers that are photocopied to illegibility. AeroLearn exists to close that gap."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <article key={title} className="card p-7">
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-h4 text-foreground">{title}</h3>
              <p className="mt-2.5 text-body-sm text-muted">{body}</p>
            </article>
          ))}
        </div>

        <div className="prose-legal mx-auto mt-16 max-w-prose">
          <h2>Why we started</h2>
          <p>
            The syllabus is public. The past papers exist. What is missing is the connection between
            them — a way to read a topic, immediately answer the questions that have actually been
            asked on it, and find out where you are still losing marks before exam day tells you.
          </p>
          <h2>How we build</h2>
          <p>
            Every lesson is written against the Nigerian curriculum and reviewed before it ships.
            Every past question carries a worked explanation, because a score with no reasoning
            teaches nothing. We keep the free tier genuinely usable so that cost is never the reason
            a student stops studying.
          </p>
        </div>
      </Section>

      <Section tone="sunken" className="border-t border-hairline">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-h2 text-foreground">Join our journey</h2>
          <p className="mt-4 text-body-lg text-muted">
            We're a small team building for a very large number of students. If that sounds like your
            kind of problem, we'd like to hear from you.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/careers" className="btn-primary btn-lg">
              View open positions
            </Link>
            <Link href="/contact" className="btn-secondary btn-lg">
              Contact the team
            </Link>
          </div>
        </div>
      </Section>
    </MarketingShell>
  )
}
