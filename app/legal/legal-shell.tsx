import Link from "next/link"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Container } from "@/components/ui/container"

/** Every policy document, used for the cross-links at the foot of each one. */
export const LEGAL_DOCS = [
  { href: "/legal/privacy", title: "Privacy policy" },
  { href: "/legal/terms", title: "Terms of service" },
  { href: "/legal/cookies", title: "Cookie policy" },
  { href: "/legal/refunds", title: "Refund policy" },
]

export function LegalShell({
  title,
  lede,
  updated,
  isoUpdated,
  current,
  children,
}: {
  title: string
  lede: string
  /** Display date, e.g. "19 August 2026". */
  updated: string
  /** Same date as ISO, for <time datetime>. */
  isoUpdated: string
  /** Path of this document, so it is excluded from the cross-links. */
  current: string
  children: React.ReactNode
}) {
  const others = LEGAL_DOCS.filter((doc) => doc.href !== current)

  return (
    <MarketingShell>
      <section className="section">
        <Container narrow>
          <p className="eyebrow">Legal</p>
          <h1 className="mt-3 text-h1 text-foreground sm:text-display">{title}</h1>
          <p className="mt-4 text-body-lg text-muted">{lede}</p>
          <p className="mt-6 border-t border-hairline pt-6 text-caption text-subtle">
            Last updated <time dateTime={isoUpdated}>{updated}</time>
          </p>

          <div className="prose-legal mt-10">{children}</div>

          <nav aria-label="Other policies" className="mt-14 border-t border-hairline pt-10">
            <h2 className="text-h4 text-foreground">Other policies</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
              {others.map((doc) => (
                <li key={doc.href}>
                  <Link href={doc.href} className="card-interactive block p-5 text-body-sm font-semibold text-foreground">
                    {doc.title}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-body-sm text-muted">
              Anything unclear? Write to{" "}
              <a href="mailto:support@aerolearn.name.ng" className="link-inline">
                support@aerolearn.name.ng
              </a>{" "}
              and a person will answer.
            </p>
          </nav>
        </Container>
      </section>
    </MarketingShell>
  )
}
