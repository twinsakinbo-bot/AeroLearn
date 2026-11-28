# P0-A institutional foundation — review evidence

Status: branch-only, disabled by default; **not approved for onboarding**. P0-B has not started.
Source: [Dan's handoff](https://docs.google.com/document/d/1Kn-Lj3Q-va5CEbMfmH-CGyidzA63HFVZQfWZmUqTreI/edit), read 28 November 2026.

## Baseline audit before implementation

The clean `work` checkout, origin/main and handoff's reported deployed source all matched `94a9c104e70310c10098204ebd6c2f2e4b70eee6`. Created `feat/institutional-mvp` before edits. Deployment status is from the handoff, not a new production inspection. No production database, student rows or credentials were read.

- `package.json`: Next.js 15.5.29, Supabase JS 2.58.0 and SSR 0.7.0.
- `supabase/migrations/0001_init.sql`: legacy JSON document tables, Auth profile triggers, generic invoker document RPCs, RLS; `lib/db.ts`, `lib/supabase/documents.ts` preserve Firebase-shaped client APIs.
- `lib/db-admin.ts`, `lib/api-auth.ts`: server-verified Auth identity, with legacy business operations using a service-role client. Institutional APIs must not reuse that bypass for tenant operations.
- `0002_licence_codes.sql`, `0003_security_hardening.sql`, `lib/licences.ts`: personal retail entitlements. No institutional backfill or changes to redemption/subscription semantics.
- `0003`: public profile projection, participant conversations/messages, global challenges, owner-only private profiles. These surfaces require persistent learner exclusion.
- `app/api/email-drip/route.ts`, `app/api/subscription/reminders/route.ts`: scheduler bypasses RLS; add explicit learner exclusion before processing/sending.
- `next.config.js`, `worker/index.js`: only fingerprinted assets are runtime cached. New API additionally returns private/no-store and varies on Authorization and school context.
- No normalized institutional tables or teacher routes at baseline. Existing student progress remains client-writable and is not trusted school reporting.

## Migration and authorization map

`supabase/migrations/20261128030853_institutional_foundation.sql` is additive except restrictive legacy privacy policies/view filtering. It applies after 0003. No data backfill. Both `INSTITUTIONAL_MVP_ENABLED` and the private database control must be enabled explicitly in an authorized local/staging environment.

| Object | Purpose / access |
| --- | --- |
| `public.institutions` | Active institutions visible to current active members only |
| `public.institution_memberships` | School admin sees school members; teacher sees assigned cohort members and self; learner sees self |
| `public.school_cohorts` | Admin sees own school; teacher/learner see assigned cohorts |
| `public.cohort_memberships` | Composite school/cohort/member FKs; learner sees own assignments only |
| `institutional_private.operators` | Owner-controlled UUID allowlist; no app/API grants; changes audited with database session actor |
| `institutional_private.staff_invites` | Confirmed Auth email hash binding, random 244-bit token shown once, SHA-256 verifier, fixed 48-hour expiry, one use/revocation |
| `institutional_private.audit` | Actor UUID, DB actor, institution UUID, action, random target ID, timestamp; no aliases, emails, tokens or request payloads |
| `institutional_private.protected_learners` | Persistent privacy tombstones, including after withdrawal and Auth deletion; no client writes |
| Private authorization helpers | Fixed empty search paths; caller-based live membership checks; no JWT/user metadata roles |
| `public.institutional_command` | Invoker wrapper for private authorized/audited transaction commands; no anonymous execution |

Authenticated users have SELECT-only grants and RLS on institutional tables. No client DML grants. Commands serialize on the institution row; authorization is checked after acquiring it. Composite FKs and immutable-link triggers reject tenant moves. The operator can execute commands but has no blanket RLS read or export exemption. School roles never grant legacy site-admin privileges. Owner bootstrap is a reviewed database operation, not an API self-promotion flow.

## Typed endpoint / role map

`GET /api/institutional` lists the caller's institutions. With `X-Institution-Id`, it returns that school's RLS-filtered memberships/cohorts/assignments. The selected school is explicit per request, never stored in shared server state. No automatic first-school selection. No export endpoint is exposed; direct reads use the same RLS restrictions.

`POST /api/institutional` accepts the strict discriminated union in `lib/institutional/contracts.ts`. Every school command must have matching `institution_id` and `X-Institution-Id`. `create_institution` alone uses null context. Bodies are streamed with a 4 KiB cap. Identity is verified using `auth.getUser(token)`; database operations use that same caller token, never the service key. Responses/errors are no-store and omit database details.

| Command | Allowed role |
| --- | --- |
| create_institution, deactivate_institution | Operator |
| invite_staff: school_admin | Operator |
| invite_staff: teacher, revoke_invite | Operator; school admin for teacher invitations only |
| accept_invite | Matching confirmed Auth account, valid unexpired/unused/unrevoked token; protected learners cannot accept staff roles |
| create_cohort, assign_cohort, remove_from_cohort | Operator or school admin in that school |
| enroll_learner | Operator after offline account ownership/notice review; alias only, no real identity mapping |
| revoke_member | Operator; school admin can revoke teachers/learners, not admins |
| withdraw | Learner, self only; revokes membership, removes assignments and alias |
| delete_learner_membership | Operator or school admin, already inactive learner only |

Revoking an accepted invitation does not revoke its resulting membership: use `revoke_member`. Revocation and deactivation block subsequent reads without waiting for JWT refresh. Already delivered data or an in-flight snapshot cannot be remotely erased. A staff account can have memberships in multiple schools; roles/assignments are evaluated independently.

## Safeguards and exceptions

Protected learners cannot appear in public profiles, community chats/messages or global challenge results. Historical learner messages stay hidden after leaving a conversation or deleting Auth. The registry is independent of user-editable profile fields and feature flags. Existing protected-account AI routes, friends (including the target), community actions and welcome mail reject before business/provider work. Scheduled drip/reminder paths skip protected accounts and fail closed if the guard lookup fails. Transactional account recovery and retail purchase receipts remain distinct from marketing.

This is a baseline protected-account block, not P0-D cost metering or school-context AI budgeting. Staff retail accounts remain retail accounts. No provider was called. No new public screens, dashboards, exports, seats, reporting, billing or progress model are claimed. Screenshots are not applicable to this backend-only PR. The urgent WAEC rehearsal work is a separate PR.

Protected accounts must be provisioned and enrolled before first learner login; this PR does not add account creation or imports. An existing retail identity must not be converted without explicit owner/school review. We do not alter its purchased entitlements. Staff teachers receive UUIDs/aliases, not contact data. Existing site administrators retain legacy private-profile access; owner review of those administrators is a release gate.

## Reproducible checks

Run from repository root, using no production `.env`:

```
npm test
npm run test:plans
npm run lint
npm run typecheck
npm run build
npm run test:db:local
npm run test:http
npm run test:institutional:http
```

Results: 46 unit/HTTP-transport tests; 4 plan tests; lint, typecheck and production build pass; six SQL suites and concurrent invite test pass; 102 missing/invalid-session production HTTP checks and 13 protected-account production HTTP checks pass. Logs are in `docs/evidence/institutional-checks.txt`. The local DB harness creates/destroys PostgreSQL 17 with no exposed host ports and applies all migrations. Auth/Storage interfaces are minimal stubs. The HTTP safeguard harness uses a local Auth/guard stub and rejects unexpected backend operations; it does not contact Supabase, mail or AI.

Fixture IDs: `a0000000-0000-4000-8000-000000000001` operator; suffixes 2/3 school A admin/teacher; 4/5 school B admin/teacher; 6/7 A/B learners; 8 outsider; 9 unconfirmed staff; 10 retail; 11 second A learner. Institution/cohort UUIDs are generated per run. Concurrent fixture prefix `c0000000`, suffixes 1/2 operator/teacher.

Expected/actual: foreign reads yield zero rows; unauthorized commands/DML raise permission errors; mismatched cohort FK fails; teacher sees assigned cohort only; learner sees self only; revoked member reads zero institutional rows; wrong/unconfirmed/expired/reused/revoked invitations fail; simultaneous acceptance yields one membership and one audit event; withdrawal/deletion never republish a learner; retail entitlement and public profile stay intact; guard failure returns 503; private errors/tokens never appear in API errors.

## Unresolved release blockers

- Real Supabase Auth/PostgREST, session revocation, invitation races with separate signed-in browser sessions, Realtime and Storage behavior need an authorized staging instance. Local stubs are not that evidence.
- Staging withdrawal, full account/content deletion, restoration and backup-expiry drill are outstanding. Local membership withdrawal/deletion is verified, not a full data-subject erasure certification.
- No human privacy, school, operator or owner sign-off. See `institutional-privacy-gates.md`.
- Confirm hosted default grants, exposed schemas (never expose `institutional_private`), advisor findings, private audit access/retention, statement/APM redaction and operator bootstrap before release. No hosted advisor was run.
- Teacher UI, school reports and seats are deliberately absent. P0-B remains blocked on P0-A review.
- Existing client-writable retail XP/progress and formative answer visibility remain baseline risks, not school evidence.

## Rollback

No deployment or production migration occurred. `vercel.json` disables Git deployment for `feat/institutional-mvp` so publishing this PR does not request a preview.

For a future authorized rollout: apply/verify the migration first in staging while both flags are off, then release compatible server code, then enable only after all gates. Existing safeguarded routes fail closed if the migration is absent.

To pause: set the API flag false and private DB `controls.enabled=false`; verify institutional API is unavailable and caller-role table reads return zero rows. Keep privacy policies, tombstones, safeguards and audit data in place. Never roll back to code that omits service-role learner guards while protected accounts exist. Do not drop tables or run a destructive down migration. For a code regression, retain/backport these guards before restoring the retail build. Reconcile accepted invites/memberships/audit before any reactivation. A deactivated institution has no self-service reactivation. Owner-reviewed maintenance is required for inactive-school retention cleanup. Restore tests must retain privacy tombstones until historical content and backups are erased under approved terms.
