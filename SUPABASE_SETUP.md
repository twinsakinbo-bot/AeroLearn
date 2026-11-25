# Supabase setup

AeroLearn runs on Supabase — Postgres for data, Supabase Auth for sign-in,
Supabase Storage for payment receipts. This replaces the Firebase project the app
used to talk to. Nothing Firebase remains at runtime.

Follow this once per environment (your machine, then Vercel).

---

## 1. Create the project

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Name it `aerolearn` (or `aerolearn-dev` for a throwaway copy).
3. Pick the region closest to your students — `eu-west-2` (London) is the nearest
   to Nigeria of the free-tier regions.
4. Save the database password somewhere real. You will not be shown it again, and
   you need it for the SQL editor's connection string later.

Provisioning takes a couple of minutes.

## 2. Create the schema

The schema, access policies, storage bucket and Auth profile triggers live in
three ordered migration files. Use a disposable project first.

1. Dashboard → **SQL Editor** → **New query**.
2. Apply [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql),
   then `0002_licence_codes.sql`, then `0003_security_hardening.sql` in order.
3. **Run** each file and stop if any statement fails. The third migration is
   required for private profile reads, licence redemption and shared AI limits.

Do not reapply an earlier migration to a live database without reviewing its
effects on later policies and functions. Run `npm run test:db` with a disposable
database URL after applying all three.

Expect `Success. No rows returned`. If you get
`stack depth limit exceeded`, you ran a partial paste — the `is_admin()` function
must be created before the policies that call it, so run the file top to bottom.

## 3. Copy the three keys

Dashboard → **Project Settings** → **API**.

| Dashboard label | Goes into `.env.local` as | Reaches the browser? |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes — safe, every query still passes through RLS |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` | **no** |

Copy `.env.example` to `.env.local` and fill those three in.

`service_role` bypasses row-level security entirely. It belongs only in
`.env.local` and in Vercel's server-side environment variables. Never prefix it
with `NEXT_PUBLIC_`, never import `lib/supabase/admin.ts` from a client
component — the `server-only` import in that file turns the mistake into a build
error rather than a leaked key.

## 4. Configure Auth

Dashboard → **Authentication**.

**URL Configuration**
- *Site URL*: `http://localhost:3000` locally; your production domain on Vercel.
- *Redirect URLs* — add both, for each environment you use:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/action`

  Google sign-in returns to `/auth/callback`, which exchanges the one-time code
  for a session cookie. Password resets land on `/auth/action?mode=resetPassword`.
  A redirect URL that is not on this list fails with
  `requested path is invalid` — the commonest cause of "Google sign-in does
  nothing".

**Providers → Google**
- Enable it, then paste the OAuth client ID and secret from the
  [Google Cloud console](https://console.cloud.google.com/apis/credentials).
- In Google Cloud, the *Authorised redirect URI* is Supabase's callback, not
  ours: `https://<project-ref>.supabase.co/auth/v1/callback`.

**Providers → Email**
- Leave *Confirm email* on. `/auth/signup` expects the verification mail.
- On the free tier the built-in mailer is rate-limited to a few messages an hour,
  which is enough for development but not for real students. Point
  **Settings → SMTP** at the same Resend account `RESEND_API_KEY` already uses
  before launch.

## 5. Make yourself an admin

`/admin` is gated on `users.data->>'role' = 'admin'`, and nothing in the signup
flow can grant that. Sign up through the app first, then in the SQL editor:

```sql
update public.users
set data = data || '{"role":"admin"}'::jsonb
where data->>'email' = 'you@example.com';
```

## 6. Verify

```bash
npm run dev
```

Then, in order: sign up with email, confirm the link, sign in with Google, and
open `/admin`. Those four exercise the trigger on `auth.users`, the session
cookie, the OAuth exchange, and `is_admin()` respectively — if all four work, the
migration is live.

---

## Deploying to Vercel

Add the same three variables under **Settings → Environment Variables**, for
Preview *and* Production. Then redeploy — `NEXT_PUBLIC_*` values are inlined at
build time, so changing them does not take effect until the next build.

Add the production origin to the Auth redirect list from step 4. Preview
deployments get a new URL per commit; add
`https://<project>-*.vercel.app/auth/callback` as a wildcard entry if you sign in
from previews.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Supabase is not configured — missing …` | `.env.local` absent or missing a key. Restart `next dev` after editing it. |
| `Supabase admin is not configured` | `SUPABASE_SERVICE_ROLE_KEY` missing. Only server routes hit this. |
| Queries return `[]` for a signed-in user | RLS is doing its job and the row's owner does not match. Check `auth.uid()::text` equals the row's `id` or `parent_id`. |
| `new row violates row-level security policy` | Writing outside your own subtree. Admin-only writes need the `role` set in step 5. |
| `requested path is invalid` on sign-in | The redirect URL is not on the step-4 allow list. |
| Receipt upload fails on `/app/upgrade` | The `receipts` bucket comes from the migration in step 2 — re-run it. |

## What changed from Firebase

Nothing in the app calls Firebase any more. The Firestore-shaped helpers
(`doc`, `getDoc`, `onAuthStateChanged`, `uploadBytes`, …) still exist and are
still what pages import, but they are now implemented over Supabase in
[`lib/db.ts`](lib/db.ts), [`lib/auth.ts`](lib/auth.ts),
[`lib/db-admin.ts`](lib/db-admin.ts) and [`lib/storage.ts`](lib/storage.ts).
That is why the migration touched ~300 query call sites without rewriting them.

Each former Firestore collection is a table of the same shape — `id text primary
key, parent_id text, data jsonb, …` — so document bodies carried over unchanged,
and the RLS policies in the migration are a direct port of `firestore.rules`:
same collections, same conditions, same admin escape hatch.


