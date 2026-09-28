import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Calendar } from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Section, SectionHeading } from "@/components/ui/section"

import { POSTS } from "./posts"

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Study guides for WAEC, NECO and JAMB, product updates, and notes on education technology in Nigeria.",
  alternates: { canonical: "/blog" },
}

export default function BlogPage() {
  const [lead, ...rest] = POSTS

  return (
    <MarketingShell>
      <Section size="lg">
        <SectionHeading
          eyebrow="Blog"
          title="Study guides and product notes"
          lede="Practical revision advice, honest write-ups of what we ship, and the occasional argument about education technology."
        />

        <Link
          href={`/blog/${lead.slug}`}
          className="card-interactive mt-14 block overflow-hidden p-7 sm:p-9"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="badge-accent">{lead.category}</span>
            <span className="text-caption text-muted">{lead.readingTime}</span>
          </div>
          <h2 className="mt-4 max-w-2xl text-h2 text-foreground">{lead.title}</h2>
          <p className="mt-3 max-w-2xl text-body-lg text-muted">{lead.excerpt}</p>
          <div className="mt-6 flex items-center gap-2 text-caption text-muted">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            <time dateTime={lead.isoDate}>{lead.date}</time>
          </div>
          <span className="link mt-5 inline-flex items-center gap-1.5">
            Read the guide
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {rest.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="card-interactive flex flex-col p-7"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="badge-neutral">{post.category}</span>
                <span className="text-caption text-muted">{post.readingTime}</span>
              </div>
              <h2 className="mt-4 text-h3 text-foreground">{post.title}</h2>
              <p className="mt-2.5 flex-1 text-body-sm text-muted">{post.excerpt}</p>
              <div className="mt-5 flex items-center gap-2 text-caption text-muted">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                <time dateTime={post.isoDate}>{post.date}</time>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </MarketingShell>
  )
}
