import type { Metadata } from "next"

import { SITE_HOST, SITE_URL } from "@/lib/site"

import { LegalShell } from "../legal-shell"

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How AeroLearn collects, uses, stores and deletes your personal data — including the Google account data we receive when you sign in with Google.",
  alternates: { canonical: "/legal/privacy" },
}

export default function PrivacyPolicyPage() {
  return (
    <LegalShell
      title="Privacy policy"
      lede="What we collect, why we collect it, who processes it on our behalf, how long we keep it, and what you can ask us to delete."
      updated="4 September 2026"
      isoUpdated="2026-09-04"
      current="/legal/privacy"
    >
      <section>
        <h2>1. Who we are</h2>
        <p>
          <strong>AeroLearn Technologies Ltd.</strong> (&ldquo;AeroLearn&rdquo;, &ldquo;we&rdquo;,
          &ldquo;our&rdquo;, &ldquo;us&rdquo;) operates the AeroLearn learning platform at{" "}
          <a href={SITE_URL}>{SITE_HOST}</a> and the AeroLearn desktop app. We
          are the data controller for the personal information described in this policy.
        </p>
        <p>
          Registered address: 5 Bello Folawiyo, Ketu, Lagos, Nigeria. Privacy contact:{" "}
          <a href="mailto:support@aerolearn.name.ng">support@aerolearn.name.ng</a>.
        </p>
        <p>
          The platform is built for Nigerian secondary school students in JSS1 through SS3 preparing
          for WAEC, NECO and JAMB. If you are under 18, please read this policy with a parent or
          guardian before you create an account.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <p>You give us this information directly:</p>
        <ul>
          <li>
            <strong>Account details</strong> — your name, email address, class level (JSS1–SS3) and
            school name.
          </li>
          <li>
            <strong>Password</strong> — only if you sign up with email. It is hashed by our
            authentication provider; we never see or store the plain text. If you sign in with
            Google, we hold no password for you at all.
          </li>
          <li>
            <strong>Subject choices</strong> — the subjects you select during onboarding.
          </li>
          <li>
            <strong>Learning activity</strong> — the lessons you open, answers you submit, quiz and
            mock-exam scores, XP, streaks, Aero Coins, notes and flashcards you create, and your
            timetable.
          </li>
          <li>
            <strong>Uploads</strong> — payment receipts for Pro verification, and any homework photo,
            document or voice note you send to the AI tutor.
          </li>
          <li>
            <strong>Community posts and messages</strong> — anything you write in the community
            section or send in chat.
          </li>
          <li>
            <strong>Support correspondence</strong> — what you tell us when you contact us.
          </li>
        </ul>
        <p>We collect this automatically when you use the platform:</p>
        <ul>
          <li>Device type, operating system and browser</li>
          <li>IP address, and the country it resolves to</li>
          <li>Pages opened, features used and timestamps</li>
          <li>Error and crash diagnostics</li>
        </ul>
        <p>
          We do not collect precise location, contacts, camera roll, microphone or SMS data. Nothing
          on the platform tracks you across other websites.
        </p>
      </section>

      <section>
        <h2>3. Signing in with Google</h2>
        <p>
          AeroLearn offers &ldquo;Sign in with Google&rdquo; as an alternative to an email and
          password. If you use it, Google asks for your consent and then sends us a limited set of
          information about your Google Account.
        </p>
        <p>
          <strong>The scopes we request, and nothing more:</strong>
        </p>
        <ul>
          <li>
            <code>openid</code> — confirms that you are the holder of the Google Account and gives us
            a stable, non-reusable account identifier.
          </li>
          <li>
            <code>userinfo.email</code> — your Google Account email address and whether Google has
            verified it. We use it as the identity of your AeroLearn account and to send you
            account-related email.
          </li>
          <li>
            <code>userinfo.profile</code> — your display name and profile picture URL, used to fill in
            your AeroLearn profile and to show your avatar on leaderboards and community posts.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> request access to Gmail, Google Drive, Contacts, Calendar,
          Photos, Classroom or any other Google service, and we do not request any scope that Google
          classifies as sensitive or restricted. Signing in with Google gives AeroLearn no ability to
          read, send or modify anything in your Google Account.
        </p>
        <p>
          <strong>Limited Use.</strong> AeroLearn&rsquo;s use of information received from Google APIs
          adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements. Specifically, data received from Google APIs is
          used only to provide and improve the features you signed in for; it is not transferred to
          anyone except as needed to provide those features, to comply with the law, or as part of a
          merger or acquisition with notice to you; it is never sold, never used for advertising, ad
          targeting or building advertising profiles; and no human at AeroLearn reads it except where
          you have given permission for a specific support request, where it is necessary for
          security, or where the law requires it.
        </p>
        <p>
          <strong>Taking it back.</strong> You can disconnect AeroLearn from your Google Account at
          any time at{" "}
          <a
            href="https://myaccount.google.com/permissions"
            rel="noopener noreferrer"
            target="_blank"
          >
            myaccount.google.com/permissions
          </a>
          . Disconnecting stops any future sign-in; it does not by itself delete the AeroLearn
          account, so email us as well if you want the account and its data removed — see section 10.
        </p>
      </section>

      <section>
        <h2>4. How we use your information</h2>
        <p>We use what we collect to:</p>
        <ul>
          <li>Create and secure your account, and keep you signed in</li>
          <li>Serve the lessons, past questions and mock exams for your class and subjects</li>
          <li>Track your progress, and work out which topics are costing you marks</li>
          <li>Run streaks, XP, Aero Coins and leaderboards</li>
          <li>Verify the receipt you upload for a Pro subscription</li>
          <li>Answer your questions in the AI tutor and grade practice essays</li>
          <li>Send you account and service email — see section 6</li>
          <li>Send study reminders and learning tips if you leave them enabled; turn them off in Settings at any time</li>
          <li>Detect and prevent fraud, cheating and abuse</li>
          <li>Diagnose faults and improve the platform</li>
        </ul>
        <p>
          <strong>Why we ask for your school name.</strong> So leaderboards rank you alongside
          classmates rather than strangers, so the material matches the exam board your school sits,
          and so we can see in aggregate which schools the platform serves well. Your school name is
          never sold, and we do not report your individual results to your school.
        </p>
        <p>
          We do not use your data to build advertising profiles, and we do not run third-party
          advertising on the platform.
        </p>
      </section>

      <section>
        <h2>5. AI features and what reaches them</h2>
        <p>
          The AI tutor, essay grader, flashcard generator, quiz generator and timetable builder work
          by sending your request to <strong>Coarena Model API</strong> when configured, or the existing Aether gateway during the transition. The gateway routes it to an AI
          provider and returns the answer.
        </p>
        <p>What is sent is limited to what the feature needs:</p>
        <ul>
          <li>The question or message you typed</li>
          <li>The lesson or question you are working on, so the answer is about the right topic</li>
          <li>The essay text you submitted for grading</li>
          <li>
            For a photo or voice note, the file itself — a voice note is transcribed first, and the
            transcript is what the model sees
          </li>
        </ul>
        <p>
          Your name, email address and school are <strong>not</strong> included in these requests, and
          no data from your Google sign-in is sent to the gateway. We do not use your conversations to train
          any model. Treat AI answers as
          study help rather than fact: they can be wrong, and they are not a substitute for your
          teacher.
        </p>
      </section>

      <section>
        <h2>6. Who processes your data for us</h2>
        <p>
          We do not sell, rent or trade your personal information. We share it only with the
          processors below, each of which handles it under contract, on our instructions, and only for
          the purpose named:
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — authentication, the database that holds your account and
            learning records, and file storage for receipts and uploads.
          </li>
          <li>
            <strong>Vercel</strong> — hosting and content delivery for the website and API.
          </li>
          <li>
            <strong>Coarena Model API, Aether AI Gateway and their model providers</strong> — AI inference for the features in section 5.
          </li>
          <li>
            <strong>Resend</strong> — sending transactional email (verification, password reset,
            receipts, study reminders).
          </li>
          <li>
            <strong>Cloudinary</strong> — storing and serving images you upload.
          </li>
          <li>
            <strong>Google</strong> — only if you choose Sign in with Google, and only as described in
            section 3.
          </li>
        </ul>
        <p>
          Beyond those, we disclose personal information only where Nigerian law or valid legal
          process requires it, where it is necessary to protect someone&rsquo;s safety, or where a
          merger or acquisition takes place — in which case we will tell you before your data moves.
        </p>
        <p>
          Some of these providers operate outside Nigeria, so your data may be stored or processed
          abroad, including in the European Union and the United States. Where that happens we rely on
          the provider&rsquo;s standard contractual protections to keep the same level of protection
          this policy describes.
        </p>
      </section>

      <section>
        <h2>7. Storage and security</h2>
        <p>
          Your account and learning data are held in a Postgres database managed by Supabase, with
          row-level security policies that scope every read and write to the account that owns the
          row. Encryption is applied in transit (HTTPS/TLS) and at rest.
        </p>
        <p>
          Payment receipts go into a private storage bucket that is not publicly readable; an
          administrator opens one through a short-lived signed link created for that purpose. Passwords
          are stored only as hashes. Administrative access is limited to the AeroLearn staff who need
          it.
        </p>
        <p>
          We do not store card numbers or bank account details. Pro subscriptions are verified by a
          person reviewing the receipt you upload.
        </p>
        <p>
          No system is perfectly secure. If a breach ever affects your personal data, we will notify
          you and the Nigeria Data Protection Commission as the Nigeria Data Protection Act 2023
          requires.
        </p>
      </section>

      <section>
        <h2>8. How long we keep it</h2>
        <ul>
          <li>
            <strong>Account and learning records</strong> — for as long as your account is open, so
            your progress is still there when you come back.
          </li>
          <li>
            <strong>After you ask us to delete the account</strong> — removed from live systems within
            30 days, and from encrypted backups within a further 90 days.
          </li>
          <li>
            <strong>Dormant free accounts</strong> — deleted after 24 months with no sign-in. We email
            you first.
          </li>
          <li>
            <strong>Payment receipts</strong> — 6 years, because Nigerian tax and company law require
            us to keep records of transactions.
          </li>
          <li>
            <strong>AI tutor conversations</strong> — 12 months, so you can look back at an
            explanation, then deleted.
          </li>
          <li>
            <strong>Technical logs</strong> — 90 days.
          </li>
          <li>
            <strong>Support email</strong> — 24 months after the request is closed.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Cookies</h2>
        <p>
          We use a small number of cookies, and none of them are for advertising. The essential ones
          keep you signed in between visits; without them you would have to log in on every page. Our{" "}
          <a href="/legal/cookies">cookie policy</a> lists each one and what it does.
        </p>
      </section>

      <section>
        <h2>10. Your rights, and how to use them</h2>
        <p>Under the Nigeria Data Protection Act 2023 you have the right to:</p>
        <ul>
          <li>Ask what personal data we hold about you, and get a copy of it</li>
          <li>Have data that is wrong corrected</li>
          <li>Have your account and its data deleted</li>
          <li>Object to, or ask us to restrict, a particular use</li>
          <li>Withdraw consent you previously gave, without affecting what came before</li>
          <li>Complain to the Nigeria Data Protection Commission</li>
        </ul>
        <p>
          To use any of these, email{" "}
          <a href="mailto:support@aerolearn.name.ng">support@aerolearn.name.ng</a> from the address on
          your account. We reply within 30 days. There is no charge, and asking will never affect your
          access to the platform.
        </p>
        <p>
          <strong>Deleting your account.</strong> Email us with &ldquo;delete my account&rdquo; and we
          will remove the account, your learning records, your uploads and your community posts on the
          timetable in section 8. Deletion is permanent — progress, XP, streaks and Aero Coins cannot
          be restored afterwards. Receipts are the one exception: we must keep those for the statutory
          period above, detached from your profile.
        </p>
      </section>

      <section>
        <h2>11. Students under 18</h2>
        <p>
          The platform is intended for students aged 13 and above. We do not knowingly create accounts
          for children under 13, and we do not knowingly collect their personal information. If you
          believe a child under 13 has an account, email us and we will delete it and the data attached
          to it.
        </p>
        <p>
          If you are between 13 and 17, please go through this policy with a parent or guardian before
          signing up. A parent or guardian may contact us at any time to see what we hold about their
          child, correct it, or have it deleted. We do not show third-party advertising to any user, and
          we do not profile students for marketing.
        </p>
      </section>

      <section>
        <h2>12. Changes to this policy</h2>
        <p>
          We update this policy when what we do with data changes. The date at the top always reflects
          the current version. If a change materially affects your rights, we will tell you in the app
          and by email before it takes effect, rather than relying on you to notice.
        </p>
      </section>

      <section>
        <h2>13. Contact us</h2>
        <ul>
          <li>
            Privacy, data access and deletion requests:{" "}
            <a href="mailto:support@aerolearn.name.ng">support@aerolearn.name.ng</a>
          </li>
          <li>Post: AeroLearn Technologies Ltd., 5 Bello Folawiyo, Ketu, Lagos, Nigeria</li>
        </ul>
        <p>
          If you are not satisfied with how we have handled a request, you can complain to the Nigeria
          Data Protection Commission.
        </p>
      </section>
    </LegalShell>
  )
}
