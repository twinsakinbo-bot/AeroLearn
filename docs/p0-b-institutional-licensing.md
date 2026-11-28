# P0-B institutional licensing — draft review

## Accepted baseline and scope

PR #4 was verified at exactly `0defd6a1f41fe783b05286e22beb57f144ff6951` and merged **only** into `integration/p0-a-waec-staging`. Accepted integration merge commit: `0afd0b5f643e94a1b15ba13ae0ec5649f213283f`. Its push CI passed: https://github.com/twinsakinbo-bot/AeroLearn/actions/runs/46156209402 (all five jobs). P0-B branch: `feat/p0-b-institutional-licensing`, created from that commit.

Source: [Dan’s institutional handoff](https://docs.google.com/document/d/1Kn-Lj3Q-va5CEbMfmH-CGyidzA63HFVZQfWZmUqTreI/edit), read before implementation. This implements its P0-B term/seat model. Main, production and hosted projects are untouched. Branch deployment is explicitly disabled in `vercel.json`.

## Model and authority

- Each school term belongs to an existing cohort. It fixes UTC instants, capacity (1–5,000), an NGN quote in integer minor units and an optional prior term. There is no payment-service integration or automatic charge.
- An active institutional **operator allowlist** entry is required to draft a term, record manual reconciliation/approval, activate, cancel, suspend/resume a term, resume a grant, revoke a grant or release a frozen used seat. Retail `admin` profile status alone grants none of these rights.
- Operators reconcile payment and required pilot sign-offs outside the app, record a non-sensitive approval reference, then separately activate. A draft or approved term grants no access. Activation creates exactly its cap in slots. Active/suspended term date ranges cannot overlap within the same school/cohort.
- A school admin can see only its school, issue batches from its activated pool, cancel unused codes and suspend learner grants. Teachers cannot manage licensing. Learners can see their own grant IDs and effective entitlement, and redeem a code only after operator enrollment and cohort assignment.
- Renewal is a new term with a new quote, approval and pool. Its start must be at or after the prior term’s end and its cohort must match. No automatic grant carry-over: learners need new codes. Scheduled terms do not confer access before their start.
- Institutional access has namespace `institutional_revision` and capability `formative_mock`. It permits repeated full formative mocks in an explicit school context, without changing `users.subscription`, `proExpiresAt`, retail codes or the retail weekly allowance. It grants no AI, community, public profile, messaging or trusted-assessment capability. School AI safeguards remain in force. Personal worked history remains readable after school access ends.

## Transactions, codes and retries

Every licensing mutation takes the same school-row lock as P0-A membership/cohort changes, then checks current authorization, term state, time and capacity. Allocation, verifier creation, redemption, entitlement creation and audit insertion commit or roll back together. Composite foreign keys bind all links to their school. Public tables are SELECT-only under RLS; private verifiers, controls and counters are inaccessible to clients. Generic document RPC allowlists do not include the new tables.

Codes comprise two independently random UUIDv4 values (244 random bits), represented as 64 lowercase hex characters. Only their SHA-256 verifier is stored. Codes are school-, cohort-, batch- and seat-bound, expire within seven days and no later than the term, and are single-use. Knowing a foreign school’s code does not enroll a learner or establish membership.

Issuance uses a client request UUID and exact payload match. A retry reserves no additional capacity and returns metadata **without revealing codes again**. Codes appear once in browser memory; no persistent browser storage, URLs, emails, analytics or evidence logs. If delivery is lost, cancel the unused batch before issuing replacements. Cancellation preserves redeemed grants. Expired unused reservations are reclaimed atomically on subsequent issuance. Per school, issuance is limited to 20 batches / 1,000 codes in a rolling hour; cancelled batches still count. Claims share a database-backed limit of 20 attempts per authenticated account per Lagos hour across schools. Invalid guesses return a generic error **without rolling back their quota consumption**.

A retry of an already successful redemption by the same live learner returns its existing grant; another account cannot replay it. Suspended grants still reserve capacity and prevent a second code from silently reviving access. Duplicate activation cannot create another pool. Eligibility uses the database clock after lock acquisition, including requests that waited across expiry.

## Revocation and reassignment policy

1. A school admin/operator may immediately suspend a grant, with a short administrative reason. It holds its seat; only an operator may resume it after checking live cohort membership and term validity.
2. An operator can revoke a grant with an explicit `reclaim` decision and reason. Without reclaim, capacity is frozen. Reclaim is permitted only after the learner’s membership is inactive or the learner has been removed from that cohort. Never transfer a live learner’s grant to another identity.
3. A frozen revoked slot can later be released by an operator after the same offboarding check. Its old grant and verifier history remain distinct; reassignment requires a fresh batch/code and creates a new grant.
4. Membership/cohort revocation, school deactivation, term suspension/cancellation or expiry removes effective school access immediately on the next operation with the same JWT. No background expiry job is needed. Cancellation is irreversible; a new approval/term is required for new access. Expiry and suspension do not delete history.
5. School entitlements are checked in the same transaction as an institutional mock start. Existing personal formative attempts may still submit/retry and retain worked history after access ends; a revoked seat cannot start a new school-context attempt. These scores are not institutional assessment evidence.

## Migration and rollback

New migration: `supabase/migrations/20261128144715_institutional_licensing.sql`. Apply **after all eight accepted migrations**, ending with `20261128140237_profile_transaction_integrity.sql`. It adds the five normalized public licensing tables, private controls/verifiers/quota records, RLS, authorized RPCs, a service-only mock-start bridge and extends the manual retention function. It does not backfill or rewrite retail/student data. All functions fix `search_path`; privileges are explicit.

The new DB licensing switch defaults **false**. The application requires both `INSTITUTIONAL_MVP_ENABLED=true` and `INSTITUTIONAL_LICENSING_ENABLED=true`. Database commands require both private DB switches. Server/mock routes fail closed; the page and navigation remain unavailable when disabled. No production activation is part of this PR.

For an approved local/staging rollback: stop the preview, set `institutional_private.licensing_controls.enabled=false` in **that isolated database**, and set `INSTITUTIONAL_LICENSING_ENABLED=false` in its separate environment. This removes licensing access while retaining records for reconciliation. Return to the accepted integration application commit; existing retail functionality and prior safeguards continue. Do not drop the additive schema or rewind a live database as a routine rollback. For disposable synthetic local data only, reset the local stack using the accepted integration checkout/config and reseed. Never use `db push`, remote reset, production credentials or hosted project links. The original P0-A audit-prune function is extended compatibly; disabling licensing leaves its existing retention behavior available.

## Privacy and retention

Licensing audit events record only school/term/target/actor IDs, action, time and a bounded administrative reason. Approval references must be reconciliation IDs, not receipt images, student names, bank details or free-form personal data. The UI uses synthetic-friendly learner aliases. No raw code is recorded in audit.

The existing manually authorized `prune_institutional_audit()` now also removes licensing events after 180 days, code verifiers 30 days after code expiry, and transient claim quotas after two days. There is no new scheduler or paid infrastructure. Redemption retries after verifier retention may report unavailable; the grant and personal history are unaffected. Term/payment-reference and grant history remains separate for reconciliation and dispute handling; controller review must decide deletion/pseudonymization and any financial-record retention before a real-school pilot. Do not claim a statutory retention period or run a purge against production without that review. Existing P0-A protected-learner tombstones and erasure procedures still apply.

## Verification and remaining gates

See `docs/p0-b-acceptance.md` for manual criteria and `docs/evidence/licensing/` for synthetic screenshots/results. Automated suites cover direct RPC/RLS access, claims, payments, term state, renewal, code cancellation, authorization revocation, retail independence, real Auth/PostgREST and deterministic concurrency. Pool totals aggregate every slot; the interface bounds each historical list to 100 recent records. Larger historical exports are not implemented in this phase; authorized RLS-scoped investigation remains available. No roster import, CRM, automatic billing, P0-C reports or P0-D AI budgets are added.

**Independent P0-B security verification and Dan’s acceptance are pending.** Hosted staging remains blocked by the free-project limit; do not upgrade, pause or delete existing projects. Windows execution on Dan’s Lenovo remains an independent gate; PowerShell syntax/local guards do not prove Windows Docker execution. Shared cohort assessments remain disabled pending implementation and independent testing of the documented trusted answer-release controls in `docs/profile-transaction-integrity.md`. The eight Mathematics questions remain DRAFT with teacher approval pending. Existing KaTeX low advisories and previously documented low-risk items remain tracked separately; no dependency upgrades are included here.
