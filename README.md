# AeroLearn

AeroLearn is a Nigerian secondary-school learning platform for WAEC, NECO and JAMB preparation. This repository contains a Next.js web app and PWA, Supabase data and storage migrations, a local-first desktop UI built with Vite, and a Tauri desktop shell. The existing document-store adapters in `lib/db.ts` and `lib/db-admin.ts` map Firestore-style calls to Supabase tables; `firestore.rules` and `storage.rules` are retained migration references, not the live authorization layer.

## Requirements

- Node.js 22 or newer and npm 10 or newer
- A disposable Supabase project for development, with Auth, Database and Storage enabled
- A Resend account with a verified sending domain for email flows
- A Coarena API key for AI features
- For desktop installers: Rust, Tauri system dependencies and the platform SDK
- For database policy checks: `psql` and a **disposable** Supabase database URL

## Local web setup

1. `npm ci`
2. Copy `.env.example` to `.env.local` and enter development credentials. Never commit `.env.local`.
3. Create a disposable Supabase project. In its SQL editor, apply `supabase/migrations/0001_init.sql`, `0002_licence_codes.sql`, then `0003_security_hardening.sql` in order. The third migration is required for private profiles, shared AI limits and licence redemption. Review each file before applying it. The migrations are not run by `npm run dev`.
4. In Supabase Auth, configure the site URL and redirect allowlist for `http://localhost:3000/auth/callback`. Configure Google OAuth only if using that sign-in method. Keep email confirmation enabled for email sign-up.
5. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Set the Supabase URL and publishable/anon key, and the **server-only** service role key. Do not place a service role key in `NEXT_PUBLIC_*` or `VITE_*`.
6. `npm run dev` and open `http://localhost:3000`.

For the full Supabase project setup and troubleshooting notes, see [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Admin access is based on `users.data.role = 'admin'`; promote only a trusted account through an audited administrator operation in a disposable or staged project. Do not let users set this field through client code.

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Browser and server | Canonical site origin and email link base |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Supabase project and public client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Privileged database and Auth operations |
| `COARENA_API_KEY` | Server only | AI tutor, questions, grading and lesson generation |
| `COARENA_MODEL`, `COARENA_BACKUP_MODEL`, `COARENA_VISION_MODEL`, `COARENA_REVIEW_MODEL` | Server only | Optional model selection |
| `RESEND_API_KEY`, `RESEND_MAIL_DOMAIN` | Server only | Verification, reset and notification email |
| `CRON_SECRET` | Server only | Vercel scheduled route authorization |
| `EMAIL_UNSUBSCRIBE_SECRET` | Server only | Signed unsubscribe links |
| `ADMIN_NOTIFICATION_EMAIL` | Server only | Receipt and status alerts |
| `AETHER_API_KEY`, `AETHER_TRANSCRIPTION_MODEL`, `AETHER_MODEL`, `AETHER_VISION_MODEL` | Server only | Optional audio and AI fallback features |
| `ALOC_ACCESS_TOKEN`, `YOUTUBE_API_KEY`, `TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY` | Server only | Optional content integrations |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Browser | Optional unsigned avatar uploads; configure the preset separately |
| `MAINTENANCE_MODE` | Server | `1` gates `/app` and `/admin` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Desktop UI | Optional desktop Supabase connectivity; public key only |
| `SUPABASE_TEST_DATABASE_URL` | Local test shell | Disposable database for read-only policy checks |

`.env.example` documents individual values and optional integrations. The service role, cron, email and AI keys must remain server-side. Public values are embedded at build time.

## Architecture and data

- `app/` is Next.js App Router. `/app` serves students; `/admin` serves administrators. API routes authenticate bearer tokens in `lib/api-auth.ts`, with service-role reads reserved for validated operations.
- `components/` contains marketing, learning, importer and UI components. `lib/` holds auth, scoring, parsing and the two Supabase document adapters.
- `supabase/migrations/0001_init.sql` defines document-shaped tables (`id`, `parent_id`, `data jsonb`, `version`, timestamps), indexes, RLS and private receipt storage. `0002_licence_codes.sql` adds prepaid codes and atomic redemption. `0003_security_hardening.sql` narrows profile reads, adds a public profile projection, limits uploads and adds shared AI, challenge claim and payment approval RPCs.
- `users`, `lessons`, `practice_questions`, `conversations`, `messages`, `challenges`, `challenge_results`, `verification_requests`, `quiz_results`, `homework`, `homework_submissions`, `notes`, `reports` and `settings` are the main document tables. `licence_codes`, `licence_batches`, `plan_durations`, `api_rate_limits` and `api_daily_usage` are relational support tables. `public_profiles` is a read-only projection for discovery.
- `desktop-app/` is a separate local-first React UI. Its notes, messages and progress are stored on the device. `src-tauri/` packages it. Desktop local data is not the same as a synced web account.
- The PWA runtime cache holds fingerprinted `/_next/static/` assets; its precache also holds build assets and public branding files. Signed-in pages, RSC responses and APIs require the network. The new worker removes private caches made by older workers on activation.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:http
npm run desktop:check
npm run test:db:local
```

For policy checks, apply the migrations to a disposable database, then set `SUPABASE_TEST_DATABASE_URL` for **that database only** and run `npm run test:db`. This is a read-only catalog check; test real student/admin access with dedicated staging accounts before release. `test:http` starts the local production build on 127.0.0.1:4318 and checks protected API routes with missing/invalid tokens; it never targets production or sends emails. CI runs the web and desktop checks on pushes and pull requests. The Tauri installer requires its platform toolchain and is not built in CI.

`test:db:local` requires Docker. It creates an isolated PostgreSQL 17 container with minimal Supabase Auth/Storage interfaces, applies all migrations, and runs catalog, RLS, payment-approval, licence-redemption and shared-rate-limit tests. It removes the container on exit and also runs in CI. This verifies SQL behavior; real JWT validation, Auth and Storage HTTP flows still need Supabase staging tests. The functional SQL files use fake rows inside rolled-back transactions and must only be run against disposable databases.

## Release procedure

1. Review [AUDIT.md](AUDIT.md), the remaining risks and dependency audit output. Resolve release blockers.
2. Apply migrations to a staging Supabase project in order; run `npm run test:db`, then exercise sign-in, admin, payment review, code redemption, challenge rewards, receipts, AI limits and PWA updates with staging accounts.
3. Build web and desktop artifacts with the production public URLs and server-only secrets in the hosting environment. Confirm that no secret is present in client bundles.
4. Review the staged Vercel deployment, cron secret, headers, HTTPS, Auth redirect URLs and storage bucket limits. Verify a new service worker replaces old response caches on an upgraded browser.
5. Only after approval, plan the production migration and deployment. No production data or deployment is changed by the repository work alone.
