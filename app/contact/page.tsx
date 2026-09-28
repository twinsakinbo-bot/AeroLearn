import type { Metadata } from "next"
import { Clock, Mail, MapPin } from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Section, SectionHeading } from "@/components/ui/section"

import { ContactForm } from "./contact-form"

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Get in touch with the AeroLearn team about support, billing, school pricing or anything else.",
  alternates: { canonical: "/contact" },
}

export default function ContactPage() {
  return (
    <MarketingShell>
      <Section size="lg">
        <SectionHeading
          eyebrow="Contact"
          title="Talk to a person"
          lede="Support questions, billing problems, school pricing, or a lesson you think we got wrong — all of it comes to the same inbox, and we read every message."
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-2 lg:gap-10">
          <div className="space-y-5">
            <div className="card p-6">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-h4 text-foreground">Email</h2>
                  <p className="mt-1 text-body-sm text-muted">Support and general enquiries.</p>
                  <a
                    href="mailto:support@aerolearn.name.ng"
                    className="link-inline mt-2 inline-block text-body"
                  >
                    support@aerolearn.name.ng
                  </a>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-h4 text-foreground">Office</h2>
                  <address className="mt-2 not-italic leading-relaxed text-body-sm text-muted">
                    5 Bello Folawiyo
                    <br />
                    Ketu
                    <br />
                    Lagos, Nigeria
                  </address>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-sunken text-accent">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-h4 text-foreground">Response time</h2>
                  <p className="mt-1.5 text-body-sm text-muted">
                    Monday to Saturday, 9am–6pm WAT. Most messages get a reply the same working day;
                    billing issues are handled first.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <ContactForm />
        </div>
      </Section>
    </MarketingShell>
  )
}
