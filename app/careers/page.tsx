import type { Metadata } from "next"
import { ArrowRight, Coffee, MapPin, Users, Zap } from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Section, SectionHeading } from "@/components/ui/section"

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Open roles at AeroLearn. Remote-first, Nigeria-based, building study tools for secondary school students.",
  alternates: { canonical: "/careers" },
}

const PERKS = [
  {
    icon: Zap,
    title: "Work that lands",
    body: "Small team, short path from idea to production. What you ship is in front of students the same week.",
  },
  {
    icon: Coffee,
    title: "Remote-first",
    body: "Work from anywhere in Nigeria. We optimise for deep focus and written communication over standing meetings.",
  },
  {
    icon: Users,
    title: "Teachers in the room",
    body: "Curriculum specialists sit alongside engineering. Nothing ships on a guess about what students need.",
  },
]

const ROLES = [
  {
    role: "Senior Frontend Engineer",
    detail: "React, Next.js, TypeScript",
    type: "Full-time",
    location: "Remote (Nigeria)",
  },
  {
    role: "Curriculum Specialist",
    detail: "WAEC / NECO / JAMB, sciences or mathematics",
    type: "Contract",
    location: "Lagos or remote",
  },
  {
    role: "Product Designer",
    detail: "Product design, design systems",
    type: "Full-time",
    location: "Remote (Nigeria)",
  },
]

const APPLY_TO = "careers@aerolearn.name.ng"

export default function CareersPage() {
  return (
    <MarketingShell>
      <Section size="lg">
        <SectionHeading
          eyebrow="Careers"
          title="Build the thing you wish you'd had at sixteen"
          lede="We're a small, remote-first team in Nigeria making exam preparation less of a lottery. If that's a problem you care about, we'd like to talk."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {PERKS.map(({ icon: Icon, title, body }) => (
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

      <Section tone="sunken" className="border-y border-hairline">
        <h2 className="text-h2 text-foreground">Open positions</h2>
        <p className="mt-3 max-w-prose text-body text-muted">
          Apply by email with a CV or portfolio and a short note on why this role. No cover letter
          template required — we'd rather read two honest paragraphs.
        </p>

        <ul className="mt-10 space-y-4">
          {ROLES.map((job) => (
            <li
              key={job.role}
              className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h3 className="text-h4 text-foreground">{job.role}</h3>
                <p className="mt-1 text-body-sm text-muted">{job.detail}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-subtle">
                  <span className="badge-neutral">{job.type}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {job.location}
                  </span>
                </p>
              </div>
              <a
                href={`mailto:${APPLY_TO}?subject=${encodeURIComponent(`Application: ${job.role}`)}`}
                className="btn-secondary shrink-0"
              >
                Apply for this role
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-body-sm text-muted">
          Nothing here that fits? Write to{" "}
          <a href={`mailto:${APPLY_TO}`} className="link-inline">
            {APPLY_TO}
          </a>{" "}
          and tell us what you'd want to work on.
        </p>
      </Section>
    </MarketingShell>
  )
}
