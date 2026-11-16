import type { Metadata } from "next"
import Link from "next/link"

import { LegalShell } from "../legal-shell"

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms and conditions governing your use of AeroLearn.",
  alternates: { canonical: "/legal/terms" },
}

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of service"
      lede="The agreement between you and AeroLearn Technologies Ltd. when you use the platform."
      updated="19 August 2026"
      isoUpdated="2026-08-19"
      current="/legal/terms"
    >
      <section>
        <h2>1. Acceptance of these terms</h2>
        <p>
          By accessing or using AeroLearn (&ldquo;the Service&rdquo;) you agree to be bound by these
          terms. If you do not agree with any part of them, you may not use the Service. If you are
          under 18, a parent or guardian must read and agree to them on your behalf.
        </p>
      </section>

      <section>
        <h2>2. What the Service is</h2>
        <p>
          AeroLearn is an online learning platform for Nigerian secondary school students (JSS1 to
          SS3). It provides:
        </p>
        <ul>
          <li>Lessons and learning material aligned with the WAEC, NECO and JAMB syllabi</li>
          <li>Practice questions and mock examinations</li>
          <li>Progress tracking and gamification — XP, streaks and leaderboards</li>
          <li>A virtual store for spending earned rewards</li>
          <li>Community features, including leaderboards</li>
          <li>A paid Pro plan with additional features</li>
        </ul>
      </section>

      <section>
        <h2>3. Your account</h2>
        <p>To use AeroLearn you must:</p>
        <ul>
          <li>Give accurate and truthful information when registering</li>
          <li>Keep your login details private</li>
          <li>Be a student currently enrolled in JSS1 through SS3</li>
          <li>Not create more than one account for yourself</li>
          <li>Tell us immediately if you suspect someone else has access to your account</li>
        </ul>
        <p>You are responsible for everything that happens under your account.</p>
      </section>

      <section>
        <h2>4. Subscriptions and payment</h2>
        <p>
          AeroLearn has a free tier and a paid Pro plan. Payment is currently made by bank transfer to
          our verified account. To upgrade:
        </p>
        <ul>
          <li>Transfer the exact plan amount to the account shown on the upgrade page</li>
          <li>Upload a clear screenshot of the payment receipt</li>
          <li>Our team verifies the payment manually, normally within 24 hours</li>
          <li>A 24-hour Trust Pass activates as soon as you submit the receipt, so you are not kept waiting</li>
        </ul>
        <p>Paid access starts when we approve the transfer and ends at the plan expiry shown in your account. Monthly access lasts 30 days. Plans do not renew or charge you automatically; you can make another transfer to renew.</p>
        <p>
          <strong>
            Payments are non-refundable once a subscription period has started, except where there has
            been a verified technical failure on our side.
          </strong>{" "}
          The <Link href="/legal/refunds">refund policy</Link> sets out the exceptions in full.
        </p>
      </section>

      <section>
        <h2>5. Virtual currency and the store</h2>
        <p>
          AeroLearn includes a virtual balance earned by completing lessons and quests. That balance:
        </p>
        <ul>
          <li>Has no real monetary value and cannot be withdrawn or exchanged for money</li>
          <li>Can only be spent on virtual items inside the AeroLearn store</li>
          <li>May be reset or adjusted as part of system updates</li>
        </ul>
      </section>

      <section>
        <h2>6. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Share quiz answers or exam questions with other students in order to cheat</li>
          <li>Upload fake or altered payment receipts</li>
          <li>Use bots or scripts to farm XP or rewards</li>
          <li>Post harmful, abusive or inappropriate content in the community section</li>
          <li>Attempt to hack, reverse-engineer or disrupt the platform</li>
          <li>Impersonate another student or a member of AeroLearn staff</li>
        </ul>
        <p>
          Breaking these rules can result in immediate suspension of your account without a refund.
        </p>
      </section>

      <section>
        <h2>7. Intellectual property</h2>
        <p>
          All content on AeroLearn — lessons, questions, graphics and code — belongs to AeroLearn
          Technologies Ltd. You may not reproduce, distribute or build derivative works from it
          without our written permission.
        </p>
      </section>

      <section>
        <h2>8. No warranties</h2>
        <p>
          AeroLearn is provided &ldquo;as is&rdquo;, without warranties of any kind. We do not
          guarantee that using the platform will result in passing any particular examination. Results
          depend on many things, most of them your own consistent effort.
        </p>
      </section>

      <section>
        <h2>9. Limitation of liability</h2>
        <p>
          AeroLearn Technologies is not liable for indirect, incidental or consequential damages
          arising from your use of the platform. Our maximum liability to you will not exceed the
          amount you paid for a subscription in the 30 days before a claim.
        </p>
      </section>

      <section>
        <h2>10. Governing law</h2>
        <p>
          These terms are governed by the laws of the Federal Republic of Nigeria, and any dispute
          will be resolved in Nigerian courts.
        </p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>
          Questions about these terms:{" "}
          <a href="mailto:support@aerolearn.name.ng">support@aerolearn.name.ng</a>.
        </p>
      </section>
    </LegalShell>
  )
}
