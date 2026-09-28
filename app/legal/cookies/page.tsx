import type { Metadata } from "next"

import { LegalShell } from "../legal-shell"

export const metadata: Metadata = {
  title: "Cookie policy",
  description: "How AeroLearn uses cookies, local storage and similar technologies.",
  alternates: { canonical: "/legal/cookies" },
}

const KINDS = [
  {
    label: "Authentication — essential",
    body: "Supabase Auth stores your session in a cookie so you stay signed in between visits. Without it you would have to log in every time you open the app. It is not used to track you.",
  },
  {
    label: "Preferences — functional",
    body: "Your theme (light or night study) and whether the sidebar is collapsed are kept in your browser's local storage, so the app looks the same each time you return.",
  },
  {
    label: "Offline cache — functional",
    body: "AeroLearn installs a service worker that keeps recently opened lessons in your browser's cache so they still open when your connection drops. Clearing site data removes it.",
  },
]

export default function CookiePolicyPage() {
  return (
    <LegalShell
      title="Cookie policy"
      lede="The short version: we use cookies to keep you signed in and to remember your settings. None of them are for advertising, and none of them track you across other sites."
      updated="4 September 2026"
      isoUpdated="2026-09-04"
      current="/legal/cookies"
    >
      <section>
        <h2>What cookies are</h2>
        <p>
          Cookies are small text files a website asks your browser to store. They let a site remember
          things between page loads and between visits — most usefully, that you are signed in.
        </p>
      </section>

      <section>
        <h2>What we use them for</h2>
        <ul>
          {KINDS.map((kind) => (
            <li key={kind.label}>
              <strong>{kind.label}.</strong> {kind.body}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Managing cookies</h2>
        <p>
          You can view or delete cookies in your browser settings. Blocking essential cookies will
          stop you being able to sign in or use core parts of AeroLearn. Most browsers let you:
        </p>
        <ul>
          <li>See which cookies are stored</li>
          <li>Delete them one at a time or all at once</li>
          <li>Block cookies from a specific site</li>
          <li>Block all third-party cookies</li>
        </ul>
      </section>

      <section>
        <h2>Third-party cookies</h2>
        <p>
          There is no advertising or analytics cookie on AeroLearn, and nothing here follows you to
          other websites. The only third parties involved are the ones that run the platform:
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> sets the session cookie described above when you sign in.
          </li>
          <li>
            <strong>Vercel</strong>, our host, may set a short-lived cookie to route your requests
            and to protect the site from abuse.
          </li>
          <li>
            <strong>Google</strong> sets cookies only if you choose &ldquo;Sign in with
            Google&rdquo;, and only within Google&rsquo;s own sign-in flow. Those are governed by
            Google&rsquo;s privacy policy at{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              policies.google.com/privacy
            </a>
            .
          </li>
        </ul>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about cookies:{" "}
          <a href="mailto:support@aerolearn.name.ng">support@aerolearn.name.ng</a>.
        </p>
      </section>
    </LegalShell>
  )
}
