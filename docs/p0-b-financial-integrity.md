# P0-B financial-integrity follow-up

Scope: OpenBot's conditional review of PR #5 at `4fb10b8cdc58338417a5e42ee594867b33102797`. This patch addresses payment-reference reuse and mock-start validation order only. Dependencies, retail licences/subscriptions, seat policies, question publication and cohort assessment controls are unchanged. The 31 previously passed independent acceptance scenarios remain the baseline for final reviewer regression; automated CI is not a claim of independently repeating those 31 human scenarios.

## Canonical payment references

The database owns canonicalization. Input is at most 80 characters. Remove every **ASCII whitespace** character (space, tab, LF, VT, FF, CR), then uppercase **ASCII a–z** without locale-dependent case folding. The resulting key must be 3–80 characters, start with `A–Z` or `0–9`, and contain only `A–Z`, `0–9`, `.`, `_`, `:`, `/` or `-`. Punctuation is retained; Unicode whitespace/confusables and unsupported characters are rejected rather than silently transformed.

For example, ` bank-a: inv - 001 ` and `BANK-A:INV-001` both identify `BANK-A:INV-001`. Use the issuer's stable transaction identifier, with a consistent issuer namespace where needed. `BANK-A:INV-002` and `BANK-B:INV-001` are distinct payments. Do not invent an alias or change punctuation/namespace to evade a duplicate conflict. The application does not contact banks or certify that a claimed payment actually occurred: the authorized operator must still reconcile it externally before manual approval and activation. No payment service or automatic charge is introduced.

New public approval RPC calls store the canonical value in `approval_ref`. The generated `approval_ref_key` canonicalizes every database writer, including private RPC/direct SQL paths. Existing stored `approval_ref` values are retained verbatim during migration for historical reconciliation; their new key uses the same algorithm. Clients cannot supply or overwrite a generated key.

## Global single consumption and reconciliation

`institutional_payment_reference_unique` is a global, non-partial database UNIQUE constraint on `institutional_terms.approval_ref_key`. It does not include a school, cohort, term-state or active-row predicate. Draft terms may have NULL references. Each non-NULL reference can belong to exactly one institutional term across all schools and cohorts. PostgreSQL's unique-index conflict handling serializes concurrent cross-school approvals even though they hold different school-row locks: one transaction commits and the other receives `23505`, with its term still draft and no partial approval audit entry. Distinct payments can commit independently.

The licensing HTTP API maps duplicate approval references to **409 Conflict**, with a clear message explaining that references attached to cancelled terms cannot be reused. It does not reveal the existing school, term, quote or approval actor. School admins still cannot approve payments, even if they know a reference; live operator authorization remains in the reviewed private command.

A database trigger preserves approved reconciliation: reference, approval actor/time, quoted amount/currency and school/term identity cannot be replaced or cleared, and approved term rows cannot be deleted through DML. Cancellation, suspension, expiry and school deactivation preserve the reference reservation and original reconciliation. Cancellation does **not** represent a refund, reversal or permission to spend a payment again. The existing audit retention operation does not delete term/payment reservations.

**Payment splitting, refunds, corrections and reallocations are unsupported in this patch.** They require a separately approved, explicitly authorized and audited financial workflow. Such a workflow must preserve the original payment, link any reversal/allocation records and prevent double allocation; it must not clear a reference, delete an approval or bypass the unique constraint. No automatic split, refund, transfer or payment reuse is implemented. Privacy/retention changes affecting these records require controller review while preserving the financial reservation.

## Migration and rollback

Apply `supabase/migrations/20261128153301_institutional_payment_integrity.sql` **after all nine reviewed migrations**, ending in `20261128144715_institutional_licensing.sql`, and only in an explicitly approved isolated environment. No production migration is authorized. The migration runs in one transaction, adds the generated key and global constraint, then installs reconciliation protection and the compatible public RPC wrapper. It leaves the reviewed private command, live authorization and seat locking unchanged. Existing RLS and SELECT-only grants remain in force.

An invalid legacy reference or canonical collision causes the entire migration to fail. Do not delete, relabel, cancel or drop records/constraints merely to force it through. Preserve the records, stop activation, and obtain a separately approved reconciliation decision. The disposable upgrade test proves an original cancelled reference is retained and a collision leaves both old records and the old schema intact, without partially installing this patch. The stored generated column/index may require a table rewrite/lock; assess existing data before any later approved migration window.

For isolated rollback, disable the licensing app/DB switches and retain the additive schema, unique constraint, immutable reconciliation and records. Reverting the UI must not re-enable payment reuse. Do not drop the constraint, clear keys or delete approvals as a rollback. A destructive reset is appropriate only for the disposable synthetic test database. No hosted environment or production operation is part of these instructions.

## Mock-start validation order

After Auth and basic start-request validation, the route checks explicit school UUID/header agreement and both institutional feature flags **before** loading public questions, draft content or the retail profile. A supplied header without matching body context is rejected. School draft review remains unavailable. For a school start, a caller-scoped live entitlement preflight also runs before the bank is read. Disabled flags, malformed/mismatched context and missing/revoked/foreign entitlement fail closed without bank access. Retail requests with no school context retain their original path.

This preflight does not replace the service-only bridge's transactional entitlement check. The bridge still locks the school and rechecks membership, term, cohort, grant and database-clock expiry when starting an attempt, preserving revocation/race protections and idempotent submission recovery.

## Regression evidence and final acceptance

Reproduce with the existing isolated local setup; never point these commands at a hosted service:

- `npm run test:db:local`: all ten migrations, eleven SQL policy suites and all earlier races; new canonical/reference/retention tests; deterministic concurrent cross-school approval and independent distinct-payment commits; disposable upgrade/preflight tests.
- `npm test`: unchanged unit suite plus approval-input and clear/private 409 transport assertions.
- `npm run build`, then `node tests/mock-start-preflight-http.mjs`: 12 production-mode HTTP cases using a local spy backend, including positive bank-loading controls. This is deliberately distinct from real Supabase evidence.
- `npm run test:integration:real`: real GoTrue/PostgREST/JWT/RLS/Next/browser baseline plus cancelled-reference conflicts, cross-school concurrent approvals, a clear 409 loser and a successful distinct payment.
- Full existing web, desktop, Mathematics-draft, HTTP safeguards and pilot browser suites remain in CI. No previous acceptance assertion is removed. The prior concurrency fixture now gives each separate synthetic term its own payment instead of reusing one placeholder reference.

Final independent verification must repeat all 31 prior scenarios and add:

| Case | Expected result |
|---|---|
| Identical reference on another same-school/cohort term | 409 / database `23505`; draft and audit unchanged. |
| Whitespace/case variants, including direct RPC | Same canonical key; no duplicate approval. |
| Same normalized reference across schools/cohorts | One global reservation, without leaking the other tenant. |
| Concurrent cross-school approvals | Exactly one approval; loser rolls back fully. |
| Cancelled-term reference reuse | Conflict; original reference, actor, time and quote remain. |
| Attempt to clear/change/delete reconciliation | Rejected at the database layer. |
| Legitimate distinct payments, including concurrent different schools | Both may commit independently under normal authorization. |
| Existing valid/colliding reconciliation migration fixtures | Original data retained; collision aborts atomically. |
| Disabled/invalid/revoked school mock start | No question-bank access; final transactional entitlement check retained. |
| Existing retail start and all earlier scenarios | Preserved; Mathematics remains draft and shared assessments disabled. |

CI links for the exact final patch head are recorded in PR #5. OpenBot's final security verdict and Dan's independent regression acceptance are requested after CI completes. No merge, deployment, production changes, spending, dependency changes or P0-C work is authorized.

Local advisor context: the security scan reported the pre-existing `public.public_profiles` definer-view and `public.doc_patch` search-path diagnostics. Neither object is changed by this patch; existing privacy/RLS regression tests still run. No diagnostic named a new payment object. These existing diagnostics are recorded for reviewers rather than suppressed or expanded into unrelated changes.
