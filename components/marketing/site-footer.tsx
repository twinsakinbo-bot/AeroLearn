import Link from "next/link"
import { Mail, MapPin } from "lucide-react"

import { Logo } from "@/components/ui/logo"

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/product/learning", label: "Guided learning" },
      { href: "/product/practice", label: "Practice & mocks" },
      { href: "/product/analytics", label: "Progress analytics" },
      { href: "/pricing", label: "Pricing" },
      { href: "/download", label: "Download app" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/blog", label: "Blog" },
      { href: "/careers", label: "Careers" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms of service" },
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/cookies", label: "Cookie policy" },
      { href: "/legal/refunds", label: "Refund policy" },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-surface-sunken bg-flat">
      <div className="container-page py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <Link href="/" aria-label="AeroLearn home">
              <Logo showTagline />
            </Link>
            <p className="mt-4 text-body-sm text-muted">
              A learning platform built for Nigerian secondary school students — the full JSS1–SS3
              curriculum, past-question practice and timed mock exams in one place.
            </p>
            <div className="mt-5 space-y-2 text-caption text-muted">
              <p className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <a href="mailto:support@aerolearn.name.ng" className="link-quiet">
                  support@aerolearn.name.ng
                </a>
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Lagos, Nigeria
              </p>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-overline uppercase text-foreground">{column.heading}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="link-quiet text-body-sm">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-muted">
            © {new Date().getFullYear()} AeroLearn. All rights reserved.
          </p>
          <p className="text-caption text-subtle">
            Not affiliated with WAEC, NECO or JAMB. Exam names are used descriptively.
          </p>
        </div>
      </div>
    </footer>
  )
}

