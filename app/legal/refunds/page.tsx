import type { Metadata } from "next"
import Link from "next/link"

import { LegalShell } from "../legal-shell"

export const metadata: Metadata = {
  title: "Refund policy",
  description: "When AeroLearn issues refunds, when it does not, and how to ask for one.",
  alternates: { canonical: "/legal/refunds" },
}

export default function RefundPolicyPage() {
  return (
    <LegalShell
      title="Refund policy"
      lede="Read this before you pay. Submitting a payment receipt means you accept the terms below."
      updated="19 August 2026"
      isoUpdated="2026-08-19"
      current="/legal/refunds"
    >
      <section>
        <h2>General position</h2>
        <p>
          Because the service is digital and available immediately,{" "}
          <strong>subscription payments are generally non-refundable</strong> once a subscription
          period has started or access has been granted.
        </p>
      </section>

      <section>
        <h2>When you may be eligible</h2>
        <p>We will consider a refund in these cases:</p>
        <ul>
          <li>
            <strong>Duplicate payment.</strong> You transferred for the same plan twice. We refund the
            duplicate once we have verified it.
          </li>
          <li>
            <strong>Technical failure.</strong> A confirmed fault on our side kept you out of the
            service for more than 72 consecutive hours after your payment was confirmed.
          </li>
          <li>
            <strong>Rejected receipt.</strong> Your receipt was submitted, our team rejected it as
            invalid, and you never received Pro access. Refunded in full.
          </li>
          <li>
            <strong>Payment not traced.</strong> You transferred the money but we cannot find the
            transaction after reviewing your receipt and confirming the account details match.
          </li>
        </ul>
      </section>

      <section>
        <h2>When we will not refund</h2>
        <ul>
          <li>A change of mind after the subscription period has started</li>
          <li>Not using the service during a period you paid for</li>
          <li>Accounts suspended for breaking the <Link href="/legal/terms">terms of service</Link></li>
          <li>Anything bought with the in-app virtual balance — store purchases are final</li>
        </ul>
      </section>

      <section>
        <h2>How to request a refund</h2>
        <ol>
          <li>
            Email <a href="mailto:support@aerolearn.name.ng">support@aerolearn.name.ng</a> with the
            subject line &ldquo;Refund request — [your email]&rdquo;
          </li>
          <li>Include your registered email address, the plan you paid for and the date of transfer</li>
          <li>Attach the original bank transfer receipt</li>
          <li>Say clearly why you are asking for a refund</li>
        </ol>
        <p>
          We reply within <strong>3 business days</strong>. Approved refunds are paid back to the
          account you transferred from within <strong>7 to 10 business days</strong>.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Refund questions:{" "}
          <a href="mailto:support@aerolearn.name.ng">support@aerolearn.name.ng</a>.
        </p>
      </section>
    </LegalShell>
  )
}
