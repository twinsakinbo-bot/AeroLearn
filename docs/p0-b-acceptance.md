# P0-B independent acceptance checklist

Record the PR head SHA, OS, Node, Docker and Supabase CLI versions and the result/evidence for every checkpoint. A CI pass is not independent acceptance. Use only generated synthetic accounts, schools and the labelled Economics software fixture. Do not distribute the eight draft Mathematics questions. No deployment, production write or P0-C/P0-D work is authorized.

## Windows setup and controls

Follow `docs/windows-local-staging.md` prerequisites, but clone the P0-B branch in a **new folder**:

```powershell
git clone --branch feat/p0-b-institutional-licensing --single-branch https://github.com/twinsakinbo-bot/AeroLearn.git AeroLearn-p0-b-local
Set-Location AeroLearn-p0-b-local
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\Local-Staging.ps1 -Action Setup
.\scripts\Local-Staging.ps1 -Action Start
```

Open `http://127.0.0.1:4323/auth/login`. View the generated passwords privately with `notepad .local-staging\accounts.json`. The separate environment and endpoints are generated automatically; do not copy `.env` or credentials from any other project. Setup applies the ninth migration and enables the two database switches **only in its allowlisted local database**, plus both server flags. It creates no school terms or charges. Rerunning Setup rotates passwords/reactivates fixtures, so do not run it midway through revocation acceptance.

Use a separate browser profile/private session per actor. The `operator` account is explicitly allowlisted; `schoolAdminA/B` and `learnerA/B` belong to separate synthetic schools. Visit **School licensing** from the navigation, or `/app/institutional`. At 360px, use the mobile menu. Times in the forms use the laptop timezone and are converted to exact UTC instants. For a short test, choose a start a few minutes ago, an end several hours ahead, and code expiry between now and that end (at most seven days).

Stop the Next app with **Ctrl+C**. In a second terminal:

```powershell
.\scripts\Local-Staging.ps1 -Action Check
.\scripts\Local-Staging.ps1 -Action Stop
```

`Start` resumes persisted synthetic records. `Stop` preserves data. The existing endpoint/link/clean-environment guards remain mandatory; no hosted project or account is needed.

## Acceptance criteria

| # | Actor / action | Required result |
|---|---|---|
| 1 | Operator opens School A; schoolAdminB tries its API context | Operator sees the selected school; B receives 403 and zero A licence rows through direct PostgREST. |
| 2 | School admin, teacher and learner attempt manual approval/activation via direct RPC | Denied, even if UI controls are bypassed. Retail `admin` status alone is insufficient without the operator allowlist. |
| 3 | Operator drafts a three-seat SS3 term with a quote | Draft records dates/cap/quote; no slots or entitlement yet. No payment is sent or charged. |
| 4 | Operator tries activation before approval | Denied; no partial pool. After external synthetic reconciliation, record an approval reference and activate separately. Exactly three slots exist. |
| 5 | SchoolAdminA bulk issues two learner codes | Two reservations, one available slot. Codes appear once and only on this response; no URL/localStorage/log/audit contains raw codes. Clear them before screenshots. |
| 6 | Retry the exact batch request UUID/payload; retry it with a different quantity | Same batch, no additional capacity and no redisclosed codes; changed payload rejected. Lost delivery is recovered by cancelling unused codes and issuing a fresh batch. |
| 7 | Attempt issuance of two more seats when only one remains | Rejected atomically; existing reservations unchanged. Competing final-seat requests create at most one batch/slot. |
| 8 | LearnerB enters A’s code in B’s school context or calls A directly | Generic unavailable/denial; no cross-school enrollment, grant, verifier or billing data. An unassigned same-school learner also cannot redeem. |
| 9 | LearnerA redeems a valid A code, then retries; another learner uses that code | One grant and assigned slot only. Same learner gets the same grant; another learner cannot claim it. A second code cannot duplicate the learner’s live cohort grant. |
| 10 | Learner opens School mock revision | Explicit school context and formative label. No trusted/shared-cohort assessment controls. Correct answer/explanation omitted from the active mock response. |
| 11 | Complete synthetic Economics mock, submit/retry, inspect result/review | Correct score and worked explanation; exactly one persisted result/reward ledger; foreign attempts denied. Repeated full formative mocks use live school entitlement, without consuming retail allowance. |
| 12 | Reload progress and restart local staging | Personal result/explanation and grant persist. Retail history, rewards, inventory and existing subscription behavior remain compatible. |
| 13 | School admin suspends grant, same learner JWT starts another school mock | Immediately denied. Existing personal attempt may finish/retry; its history remains. Admin cannot resume; operator may resume only a valid live grant. |
| 14 | Remove learner from cohort or revoke membership without changing JWT | No effective entitlement or new school mock. Direct RPC cannot bypass membership checks. Suspended grants still reserve capacity. |
| 15 | Operator revokes with reclaim while learner remains active in cohort | Denied. Revocation without reclaim freezes capacity. After explicit offboarding, reclaim/release works and a new code/new grant is required for reassignment. Old code never transfers ownership. |
| 16 | Cancel a batch containing redeemed and unused codes | Unused codes become invalid and release reservations; already redeemed grants remain. Audit records the action/reason without codes. |
| 17 | Operator suspends/cancels term; learner tries new mock or claim | Denied. Suspension is reversible only by operator; cancellation cannot resume. School deactivation likewise denies access. |
| 18 | Allow code and short term to expire, including a request waiting on a database lock | DB clock enforces expiry after lock acquisition; no cron required. Expired unused codes are reclaimed on later issuance. Expired terms cannot reactivate. |
| 19 | Create a renewal tied to prior term | New approval/reference/pool required; start cannot precede old end; active/suspended cohort terms cannot overlap. Scheduled renewal grants no early access and does not copy old grants. |
| 20 | Give learner an independent synthetic retail licence, then revoke/cancel school access | Retail subscription/expiry remains unchanged, retail functionality continues. School entitlement grants no retail-wide Pro, AI, social or trusted-assessment permission. |
| 21 | Guess codes repeatedly / issue and cancel batches | Shared direct-RPC limits: 20 learner attempts per Lagos hour; 20 batches / 1,000 issued codes per school rolling hour. Failed guesses consume quota; cancelled batches still count. |
| 22 | Inspect audit and privacy boundaries | School admin sees own licensing events only. Learner sees self grant metadata only, no quotes/approval records/verifiers/other learners. Reasons contain no personal student data. |
| 23 | Repeat operator/admin/learner journeys at 360px and desktop | Readable labels, usable controls, no horizontal page overflow, clear availability/error/state messages. Record redacted screenshots. |
| 24 | Switch both licensing flags off in isolated staging and return app to accepted baseline | New page/API/commands fail closed, prior P0-A controls and retail remain. No destructive rollback or production operation. |

For direct calls on Windows use the existing `scripts/Invoke-LocalStagingApi.ps1` helper as documented in `docs/windows-local-staging.md`; the route is `/api/institutional/licensing`, explicit `X-Institution-Id` matches the command’s `institution_id`. Command contracts live in `lib/institutional/licensing-contracts.ts`. The application never accepts an actor ID, operator override, client-chosen code, balance or entitlement expiry override.

Automated race tests use actual concurrent PostgreSQL sessions with explicit `pg_blocking_pids` barriers; browser/network limitations must be reported separately from observed application failures. Do not report a simulated adapter run as real Supabase evidence. CI’s real-supabase job exercises GoTrue, JWTs, PostgREST, RLS and browser flows.

OpenBot security review, Dan’s independent Windows acceptance, controller privacy/retention sign-off and any later hosted preview remain separate gates. Request approval after independent P0-B verification. Keep the PR draft until then; do not merge, deploy or start P0-C/P0-D/shared assessments.
