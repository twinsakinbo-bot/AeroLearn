# PR #4: focused profile concurrency follow-up

Based on independently reviewed commit `6b17cdaabb403211785c992ee0da5842b38211aa`. The original hardening migration is unchanged. New migration `20261128140237_profile_transaction_integrity.sql` follows it. No production migration, merge, deployment, purchase or P0-B feature is included. No dependencies were upgraded.

## Confirmed race and correction

`touch_updated_at` changed timestamps but did not advance `users.version`. Raw SQL rewards, purchases, mocks, challenges and licence/receipt operations could therefore leave an old version valid. Independently, `doc_patch` selected its JSON/version without locking, checked the expected version, then issued an unconditional UPDATE from that old JSON. A concurrent commit between those steps could be overwritten even when an expected version was supplied.

The database now owns document versions. A trigger sets INSERT versions to 1 and every UPDATE to exactly `OLD.version + 1`, including raw SQL and service operations. Authenticated/anonymous callers cannot choose or reset the physical counter, even if otherwise authorized to edit the row. The same document-store rule covers all 14 versioned document tables so generic patch behavior is consistent. Normalized institutional tables and unrelated tables are unchanged.

`doc_patch` reads with `SELECT ... FOR UPDATE` before checking the expected version or calculating any JSON changes. The row lock stays held through mutation. A blocked caller sees the committed version after the lock is released; stale expected versions raise `40001`. Unconditional field patches merge into the locked latest row. A missing row with a non-null expected version also fails with `40001`. The RPC no longer increments version itself, avoiding a double increment under the trigger. Concurrent creation of a missing document remains protected by its primary key; it cannot silently overwrite another insertion.

### Writer audit

| Writer | Serialization and version behavior |
| --- | --- |
| Practice/lesson rewards and purchases | Existing profile row lock retained; canonical trigger advances version |
| Mock allowance and submission | Existing profile locks, immutable attempts/results and idempotency retained; all actual profile updates bump version |
| Daily login | New service-only SQL transaction locks the profile, evaluates the Lagos day, consumes a freeze once and grants the daily reward once |
| Quest claims | New service-only SQL transaction locks the profile and checks verified ledger totals; stable per-tier reward event prevents duplicate tier credit |
| Weekly challenges | Existing atomic result claim plus wallet UPDATE retained; trigger now versions that UPDATE |
| Licence redemption | Profile locked before code claim and expiry read; distinct concurrent term codes extend sequentially; permanent access cannot be shortened |
| Receipt approval | Existing receipt/profile locks retained; trigger versions profile mutations |
| Trust Pass | Existing profile compare-and-swap now sees all SQL mutations and checks them under row lock |
| Reminder expiry/streak resets | Decisions based on an older profile now pass its expected version; a concurrent renewal/login causes the stale reset to be skipped |
| Admin revocation, email tracking and other field patches | Intentional updates merge under the `doc_patch` row lock and advance the canonical counter |

Login and quest HTTP routes no longer calculate balances in application-level optimistic callbacks. New UI quest requests include the expected tier, so retry after a lost response returns the already-claimed tier without paying it again. Older type-only clients retain “claim the current eligible tier” behavior; no tier can be credited twice. Server timestamps and ledger events, not client dates or claims, authorize daily awards.

Practice reward days and login days explicitly use `Africa/Lagos`. The practice quota's midnight calculation is centralized in a private function tested at 22:59:59Z and 23:00:00Z while changing the session timezone. Generation quotas already used Lagos; invitation UTC buckets remain intentionally unchanged.

## Verified practice versus legacy history

The private session snapshot and first recorded server-validated answers now create an immutable `practice_verified` result when the session is complete. Correctness does not depend on reward amount, so a reward cap cannot turn a correct answer into a wrong quiz score. Reserved `practice:` IDs and source markers cannot be written/edited/deleted by clients.

Quiz badge counts come from private completed practice-answer records and private submitted mock attempts through an authenticated server endpoint. They do **not** trust a public result's source label: a historical row forged with `source: practice_verified` but without private backing remains legacy and cannot unlock badges. Mock history is also selected by private backing IDs. Draft previews remain excluded from badge counts. Legacy records are kept, counted separately and never retroactively certified. Newly completed practice avoids writing a duplicate legacy row when its server result exists.

Partially completed sessions that cross this migration may lack recorded private answers for earlier rewards. They are not guessed/backfilled from XP; their legacy history is preserved and a fresh session can earn a verified quiz result. Other personal engagement badges still use the protected profile counters documented by the original hardening; they are not institutional academic evidence.

## Deterministic regression evidence

`tests/profile-concurrency.mjs` uses independent real PostgreSQL sessions and explicit lock barriers. It waits until PostgreSQL reports the second writer blocked behind the first (`pg_blocking_pids`), then commits the first writer. It does not rely on a guessed sleep to create a race.

Cases cover stale CAS while a raw SQL writer holds the row; a non-CAS field patch behind a purchase; daily login consuming a freeze while a purchase waits; repeated login and quest claims; lesson reward plus challenge credit; duplicate challenge credit; two distinct licence renewals; mock submission plus login; duplicate purchase; permanent renewal protection; and a stale expiry reset after a renewal. Assertions check exact balances, inventory, tier/ledger uniqueness and entitlements.

`tests/profile-integrity.sql` checks canonical increments, client metadata guards, stale-version rejection, service-only RPC grants, verified answer-derived results, forged legacy labels and timezone boundaries. The existing full security, privacy, deadline, pool isolation and concurrency suites remain enabled. Real Supabase tests additionally exercise versions, stale CAS, verified practice and parallel login/quest requests through Auth/PostgREST and the Next routes.

Reproduce with the existing integration commands: `npm ci`, lint, typecheck, unit/plan/math tests, `npm run test:db:local`, production build, HTTP/safeguard checks, desktop build, pilot browser suite and real Supabase suite. Run Next/browser processes sequentially. CI database tests now explicitly provision Node 22 for the dependency-free Docker/psql concurrency driver. See [check evidence](evidence/profile-integrity/checks.txt) and the PR's exact-head Actions runs.

For an existing Windows synthetic runtime, stop the app and run PowerShell `Setup` before `Start`; Setup now applies pending additive **local** migrations after its existing project/link/endpoint checks. It does not reset the database. Setup still rotates synthetic passwords/reactivates fixture memberships; do not rerun during a revocation acceptance test. Hosted staging and actual Lenovo/Windows acceptance remain separate gates.

## Trusted assessment answer-release policy: required before cohort implementation

The current primitive is for individually issued trusted attempts and releases worked review after that learner submits. It must **not** be activated as a shared cohort assessment under this behavior. No cohort assessment or release-control implementation is included here.

Before cohort work is approved, the design must require:

1. An explicit teacher-authorized release time no earlier than the latest applicable cohort deadline, accommodation extension and recovery window. Missing release configuration fails closed.
2. Server-side withholding of answer keys, explanations, correct-option indicators and per-question correctness until release, including retry/history/export/notification/cache responses. Hiding UI elements is insufficient. Grade-derived badges, progress counters and leaderboards are also release surfaces and must not disclose a withheld result. Define whether an aggregate score is released earlier as a separate teacher policy.
3. A redacted response projection before release while retaining immutable private grading snapshots. A retry must not bypass release by returning an unredacted cached result.
4. Live school membership and assigned-cohort authorization for staff review; learner access limited to their own permitted results. Revocation and withdrawal must take effect without waiting for token refresh.
5. Reviewed provenance and freshness rules. Once solutions are released/shared, do not treat the same questions as unseen trusted content for another cohort or learner. The existing private pool registry and no-reissue safeguards remain necessary but cannot detect external knowledge or collusion.
6. Regression tests for early submission, late/recovery submission, cohort extensions, missing release time, release boundary, revoked membership, cached retries and direct RPC/data access before any rollout.

The eight original Mathematics questions remain draft and are not enabled by this policy document. Qualified teacher approval, independent review, hosted staging and Windows acceptance remain separate requirements. No P0-B work is authorized by this follow-up.

## Remaining low-risk findings, tracked separately

- The four previously documented low KaTeX dependency advisory entries remain; the explicit untrusted renderer setting stays in place. Dependency changes are outside this follow-up.
- Legacy wallet/progress values and client-written history are preserved as uncertified data; they cannot be promoted into institutional reports or verified quiz badges by changing a source label.
- The generic application transaction adapter still sends separate RPCs for multi-document workflows. Critical login/quest money operations now use single SQL transactions. Cross-row receipt lifecycle validation for the existing Trust Pass flow remains an independent review item; profile entitlement overwrites are prevented by the corrected CAS. Do not describe that adapter as general cross-document ACID.
- Notification delivery can race a renewal or another notification job. The guarded state updates cannot remove the new entitlement/streak; exactly-once email delivery is a separate low-risk workflow concern.

Stop profile-mutating traffic before applying the paired migration/API revision; stop the local app before running Setup. Do not mix an old in-flight patch implementation with the new counter trigger.

Rollback must keep canonical version ownership and row-lock validation together. Do not restore client-controlled counters, drop private verification records or weaken previous learner/key protections. Disable the affected operations and coordinate code/schema rollback if a defect is found. Nothing was applied to production. Independent re-verification of the new PR head is required.


## Recorded local results

Passed: 52 unit tests, four plan-flow tests, eight draft Mathematics calculation checks, nine SQL suites, the four prior concurrency scenarios and eleven new lock-barrier races (plus the stale-expiry assertion), production build, lint/typecheck, 106 unauthorized HTTP checks, 13 learner-safeguard HTTP checks, desktop build, 360px/1280px pilot browser tests and the expanded real local Supabase Auth/PostgREST suite. PowerShell parsing passed on Linux; actual Windows acceptance remains pending. All eight migrations applied in order on the isolated local security stack, with the new integrity migration last. No package or lockfile changes were made.

The real-service test confirms private-backed practice scoring, changed profile versions, stale CAS rejection, client metadata-write denial and one credit from parallel login/quest requests. The PostgreSQL session tests cover the specific check-before-UPDATE race using a real blocked writer; the result is an explicit `40001` with the committed balance preserved.
