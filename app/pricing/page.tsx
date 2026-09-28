import type { Metadata } from "next"
import Link from "next/link"
import { Check, Minus, ShieldCheck, Zap } from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Section, SectionHeading } from "@/components/ui/section"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "AeroLearn is free to start. Pro is ₦2,500 a month for every subject, unlimited WAEC, NECO and JAMB practice, full mock exams and the AI tutor.",
  alternates: { canonical: "/pricing" },
}

type Cell = string | boolean

const GROUPS: { heading: string; rows: { feature: string; free: Cell; pro: Cell }[] }[] = [
  {
    heading: "Core",
    rows: [
      { feature: "Curriculum lessons (JSS1–SS3)", free: "2 subjects", pro: "Every subject" },
      { feature: "Past-question practice", free: "Limited set", pro: "Unlimited" },
      { feature: "Timed mock exams", free: "1 per week", pro: "Unlimited" },
      { feature: "Offline desktop app", free: true, pro: true },
    ],
  },
  {
    heading: "AI",
    rows: [
      { feature: "AI chat tutor", free: "2 questions per topic", pro: "5 questions per topic" },
      { feature: "AI essay grading", free: false, pro: true },
      { feature: "Personalised study plan", free: false, pro: true },
    ],
  },
  {
    heading: "Progress & motivation",
    rows: [
      { feature: "Progress tracking", free: true, pro: true },
      { feature: "Streaks and Aero Coins", free: true, pro: true },
      { feature: "Weak-topic insights", free: false, pro: true },
      { feature: "Global leaderboards", free: false, pro: true },
    ],
  },
]

const FAQS = [
  {
    q: "Can I really use the free plan for as long as I like?",
    a: "Yes. Basic has no time limit and no card required. It caps how much you can access, not how long you can stay.",
  },
  {
    q: "How do I pay?",
    a: "Bank transfer. The upgrade page shows our account details — transfer the exact amount and upload a screenshot of the receipt. A 24-hour Trust Pass unlocks Pro immediately while a person checks the payment.",
  },
  {
    q: "Does it renew automatically?",
    a: "No. Each period is a single transfer, so nothing is ever taken again without you deciding to. There is no card on file and nothing to cancel.",
  },
  {
    q: "Is there a discount for schools?",
    a: "Yes — get in touch and we'll work out a rate based on the number of students.",
  },
]

/** Renders a boolean as an icon with an accessible label, a string as text. */
function CellValue({ value, emphasis }: { value: Cell; emphasis?: boolean }) {
  if (typeof value === "string") {
    return <span className={emphasis ? "font-semibold text-foreground" : "text-muted"}>{value}</span>
  }
  return value ? (
    <>
      <Check
        className={`mx-auto h-4 w-4 ${emphasis ? "text-accent" : "text-muted"}`}
        aria-hidden="true"
      />
      <span className="sr-only">Included</span>
    </>
  ) : (
    <>
      <Minus className="mx-auto h-4 w-4 text-subtle" aria-hidden="true" />
      <span className="sr-only">Not included</span>
    </>
  )
}

export default function PricingPage() {
  return (
    <MarketingShell>
      <Section size="lg">
        <SectionHeading
          eyebrow="Pricing"
          title="Free to start. ₦2,500 for everything."
          lede="One plan, one price, no per-subject add-ons. Less than a single printed textbook per month."
        />

        <div className="mt-14 overflow-hidden rounded-xl border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <caption className="sr-only">Comparison of the Basic and Pro plans</caption>
              <thead>
                <tr className="border-b border-hairline bg-surface-sunken">
                  <th scope="col" className="p-6 align-bottom text-h4 text-foreground">
                    Compare plans
                  </th>
                  <th scope="col" className="w-56 p-6 text-center align-bottom">
                    <span className="block text-h4 text-foreground">Basic</span>
                    <span className="mt-1 block text-h3 font-bold text-foreground">Free</span>
                    <Link href="/auth/signup" className="btn-secondary btn-sm btn-block mt-4">
                      Get started
                    </Link>
                  </th>
                  <th scope="col" className="w-56 p-6 text-center align-bottom">
                    <span className="badge-accent mb-2">Recommended</span>
                    <span className="block text-h4 text-foreground">Pro</span>
                    <span className="mt-1 block text-h3 font-bold text-foreground">
                      ₦2,500
                      <span className="text-body-sm font-medium text-muted">/mo</span>
                    </span>
                    <Link href="/auth/signup" className="btn-primary btn-sm btn-block mt-4">
                      Upgrade to Pro
                    </Link>
                  </th>
                </tr>
              </thead>

              {GROUPS.map((group) => (
                <tbody key={group.heading}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={3}
                      className="border-y border-hairline bg-surface-sunken px-6 py-2.5 text-overline uppercase text-muted"
                    >
                      {group.heading}
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.feature} className="border-b border-hairline last:border-0">
                      <th scope="row" className="px-6 py-4 text-body-sm font-medium text-foreground">
                        {row.feature}
                      </th>
                      <td className="px-6 py-4 text-center text-body-sm">
                        <CellValue value={row.free} />
                      </td>
                      <td className="px-6 py-4 text-center text-body-sm">
                        <CellValue value={row.pro} emphasis />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="card flex gap-4 p-6">
            <ShieldCheck className="h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <h2 className="text-h4 text-foreground">No card details, ever</h2>
              <p className="mt-1.5 text-body-sm text-muted">
                Pro is paid by bank transfer and checked by a person. We never ask for card or
                account numbers, so there is nothing of yours for us to store.
              </p>
            </div>
          </div>
          <div className="card flex gap-4 p-6">
            <Zap className="h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <h2 className="text-h4 text-foreground">Nothing renews on its own</h2>
              <p className="mt-1.5 text-body-sm text-muted">
                One transfer buys one period. When it ends you decide whether to pay for another —
                no contract, no notice, nothing to cancel.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="sunken" className="border-t border-hairline">
        <SectionHeading eyebrow="FAQ" title="Questions we get asked" />

        <div className="mx-auto mt-12 max-w-3xl divide-y divide-hairline border-y border-hairline">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body font-semibold text-foreground">
                {faq.q}
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-hairline text-muted transition-transform group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-prose text-body-sm text-muted">{faq.a}</p>
            </details>
          ))}
        </div>

        <p className="mt-10 text-center text-body-sm text-muted">
          Still unsure?{" "}
          <Link href="/contact" className="link-inline">
            Ask us directly
          </Link>{" "}
          — we answer every message.
        </p>
      </Section>
    </MarketingShell>
  )
}

