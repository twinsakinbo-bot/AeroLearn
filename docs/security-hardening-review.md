# Targeted hardening of integration PR #3

Branch `security/p0-a-assessment-hardening`, based on integration commit `44e197f`. No production database, deployment, merge, paid service or P0-B implementation is involved. The OpenBot summary supplied by the user was a conditional pass (0 critical/high, 2 medium, 4 low); this review does not invent details from an unavailable full report.

## Confirmed findings and changes

### Deadlines and recovery

Previously, all submissions were scored regardless of server receipt time. Full mocks now have a database deadline (`started_at + duration_seconds`). The browser backs up full-mock answers as they change. Before deadline, submission grades the supplied answers; after deadline it grades only the last checkpoint received before deadline. The browser clock cannot extend it. A checkpoint received after deadline is rejected. The `mock:` result ID prefix is reserved against client pre-creation as well as later edits, preventing a forged formative row from blocking a legitimate server save. An immutable saved result is returned on all subsequent submission retries, including retries much later, without another reward.

Trusted assessments use the same mechanism with an explicit 120-second recovery window. A submission in that window finalizes the pre-deadline checkpoint; changes in the recovery payload are ignored. Beyond the window, a saved expired result remains available for review but is ineligible for institutional reports. Unsynced offline changes cannot be certified from a client timestamp. Keep the answer screen open and restore connectivity before deadline; the app warns when answer backup fails. Formative short revision/draft review remains flexible and can save late answers. Full mocks remain formative, even if timed and server scored.

The trusted mode is a restricted service primitive, not an exposed start option. There is no assignment/reporting UI, assessment-issuance API, teacher entitlement or P0-B workflow in this change. It requires one active learner school context and binds its institution at creation. Report eligibility is rechecked under the institution lock at submission, so membership revocation/deactivation cannot certify a subsequent result. Questions previously issued to that learner cannot be issued again, because their worked answers may already be known. Identical start request IDs still recover the original attempt. Human review, authorized issuance and safe question reuse policies remain future release gates. This is not proctoring or protection against collusion/external resources.

### Answer-key exposure: proven, not assumed fixed globally

Authenticated users can read `correctAnswer` and `explanation` before submission through:

- `practice_questions` SELECT;
- `mock_question_bank` SELECT (its `data` contains the revision row);
- generic `doc_query('practice_questions', ...)`.

Regression SQL and real PostgREST tests explicitly demonstrate that exposure. These are legitimate worked-revision features; stripping them globally would break retail practice. No claim is made that those banks can support trusted assessment.

Trusted questions instead live in `mock_private.assessment_questions`, outside exposed schemas, with RLS and no browser grants. Generic document RPC allowlists reject the private collection. A server start validates the complete trusted snapshot against that private table. Reciprocal triggers use a private atomic identifier/hash registry to reject ID or normalized-stem overlap with the revision pool, including legacy `text` aliases. It serializes conflicting inserts and remembers exposure after revision rows are deleted. The migration seeds hashes of current bank rows; it cannot discover content deleted before the migration or content previously exposed elsewhere. This detects accidental duplicate imports, not semantic paraphrases or content already known externally. No existing question was silently reclassified. Draft Mathematics was neither copied nor published. Only synthetic private questions are used in tests.

Only server-scored, trusted, report-eligible attempts with a bound institution enter `mock_private.verified_assessment_results`. This projection is private/service-only; it is the required input for future authorized institutional reports. Existing `users.xp`, wallet balances, engagement totals, self-written quiz history and the legacy source name `mock_verified` are not academic evidence. That source name is retained for retail compatibility; the explicit `assessmentType` and private projection distinguish trust.

### Transactional invitation limits

The invitation INSERT trigger enforces 10 successful invitations per actor per UTC hour, 50 per school per UTC day, and at most 100 outstanding, unexpired invitations per school. Counters include invitations later revoked. Accepted/revoked/expired invitations free pending capacity, but do not reset creation rate. Fixed buckets use explicit UTC, so a caller's session timezone cannot create additional buckets. Institution row locking and atomic counter increments serialize concurrent requests; transaction rollback also rolls back counters. Direct `institutional_command` RPC calls follow exactly the same path. No client quota bypass or new service dependency exists. The HTTP API returns 429 for quota/capacity denials. Tests race two requests for one remaining slot.

### Reward and progress audit

| Surface | Previous authority | Hardened behavior |
| --- | --- | --- |
| Profile `xp`, `coins` | Direct owner UPDATE/document RPC | Database trigger rejects authenticated writes, including site-admin client writes |
| `totalQuestionsAnswered`, `totalQuestionsCorrect`, `subjectsStudied`, `completedLessons`, `studyStats` | Client increment/array writes | Validated server snapshots or published-lesson completion; once-only reward ledger |
| `streak`, `longestStreak`, `lastLoginDate`, `lastActiveDate`, `inventory`, `quests` | Client could reset/grant state used by server claims | Server-managed; existing daily-login transaction remains; quest targets use new verified reward events |
| `completedTopics`, `completedQuizzes`, `homeworkCompleted`, `badges`, `balance`, `level`, obsolete `xpBoostExpiresAt` | Writable legacy/fallback fields | Protected against client changes; not used for institutional evidence |
| `lastMockExamDate` | Earlier integration guard protected UPDATE | Also protected on client initialization; owner DELETE cannot reset a profile |
| AI practice | Client submitted correctness/increments | AI endpoint registers its own private formative snapshot; answer endpoint verifies owner/question/answer; first answer only; daily reward cap of 100 practice items |
| Lesson completion | Client awarded XP repeatedly | Requires an existing published lesson (legacy lessons without a status retain their released meaning); one award per learner/lesson |
| Store purchase | Client transaction selected cost/balance | Server catalogue fixes price; serial profile lock and owned-item retry prevent double spend |
| Mock rewards | One award per attempt, repeatable public questions | One award per correctly answered question per learner across attempts; retry-safe and transactionally saved |
| Weekly challenge | Already server-scored, one claim per challenge | Existing validated server operation retained; its public questions remain formative |
| Profile generation counters | Client display/cache fields | Existing server daily quota table enforces generation limits; display counters are not reward/report evidence |
| Own legacy quiz history | Client-writable formative rows | Preserved for retail history; never input to the private report projection |

The reward ledger is private, immutable to clients and records operation keys and server-calculated amounts. Unknown lessons, foreign/missing practice sessions, fake item IDs, client-supplied prices and duplicate awards cannot grant rewards. Correctness totals remain accurate when a practice reward cap is reached. Store pricing matches the existing catalogue. AI practice stays explicitly formative and is not a replacement for missing reviewed exam content.

Existing wallet/progress values are preserved for retail compatibility. They may already contain historical client edits and are not retroactively certified. Quest eligibility uses only post-hardening verified reward events, so an old inflated XP total cannot mint new quest coins. Old completed lessons remain completed; they are not automatically backfilled into the new reward ledger. Learning/engagement rewards do not prove mastery or time spent reading. Display/cosmetic preferences remain writable and confer no institutional role.

### Dependency advisories

`npm audit fix` was run without `--force`. A scoped compatible override patches `@tailwindcss/typography`'s 6.x `postcss-selector-parser` to **6.1.6** (patched floor: 6.1.5), removing both moderate advisory entries. Audit moved from 6 findings (4 low, 2 moderate) to **4 low, 0 moderate/high/critical**. The remaining chain is KaTeX / rehype-katex / remark-math / micromark-extension-math, [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7). The advisory's fixed KaTeX line starts at 0.18.2; the current compatible 0.16.x line has no fixed release. The shared Markdown renderer now passes its own explicit `trust: false` option rather than relying on an inherited/default property. A regression exercises HTML macros under a polluted inherited `trust` value. This is defense in depth, not a claim that the upstream advisory is fixed. A forced version-boundary upgrade was not applied. Math rendering compatibility needs a separately reviewed update; this remains a release limitation. The selector-parser advisory is [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).

## Audit retention and storage policy

Institutional security events remain in the existing PostgreSQL private schema: IDs, actor ID, operation and time only. No invitation token, question answer, email address, DOB, IP address or free-text command payload belongs in the audit table. Invite email hashes are personal data, not anonymized records. Staff/student clients have no read/write access. No external logging vendor, new paid storage, partitions or analytics pipeline is introduced.

Proposed default retention: 180 days for audit events, expired invitation rows until 30 days after expiry, and invitation quota buckets for two days. `prune_institutional_audit()` is a service-only maintenance operation with regression-tested boundaries. Run it manually on an approved schedule in staging; no production cron is enabled. Before a school rollout, the school's controller must approve this default and any legal-hold exception. Suspend pruning while a documented hold is in force; avoid collecting more identifying information. Limit maintenance access and record administrative execution in the existing operations process.

Reward event keys are retained with the account to maintain idempotency; practice session snapshots and assessment results require a separately agreed learner-record retention policy before school deployment. Privacy tombstones must not be pruned by this audit cleanup: they prevent rediscovery of withdrawn/deleted learners and need a verified legacy-content/backup erasure procedure. Backups must expire under the approved platform backup policy; deleting live audit rows does not instantly erase retained backups. Hosted storage encryption and backup configuration are a staging/production gate; local synthetic Docker volumes are not a claim of school-data encryption. Keep local generated credentials private, use laptop disk protection, and never copy real student data into this setup.

## Reproduction and gates

Use Node 22, Docker, Python 3 and Chromium. All data are synthetic. The dedicated real-security Supabase stack uses project `aerolearn-security`, API/DB ports 59321/59322, local mail 59324–59326 and app 4324; it does not reuse the earlier engineering stack. The Windows acceptance launcher still uses its own 554xx ports and now accepts the exact hardening branch as well as integration.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:plans
npm run test:math-review
npm run test:db:local
npm run build
npm run test:http
npm run test:institutional:http
npm --prefix desktop-app ci
npm run desktop:check
npx playwright install --with-deps chromium
npm run test:pilot:e2e
npx --yes supabase@3.4.0 start -x realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npm run test:integration:real
npx --yes supabase@3.4.0 stop
```

For a separate Windows acceptance checkout, clone `security/p0-a-assessment-hardening` and use [the PowerShell guide](windows-local-staging.md) for Setup/Start/Stop. Keep the generated runtime separate from an earlier integration checkout; do not copy credentials. For a timed-mock recovery check, wait for an answer backup before going offline. A full mock's late changes must not change the saved pre-deadline answer; short revision deliberately remains flexible. Windows acceptance is still independent and has not been performed here.

Run Next/browser suites sequentially. SQL suites migrate a fresh disposable database and roll back test fixtures; race tests use dedicated synthetic identities. Real-service tests use GoTrue, PostgREST, PostgreSQL/RLS and actual Next handlers, not an Auth adapter. The separate pilot suite retains its documented local Auth/PostgREST adapter. Managed-workspace localhost health-proxy limitations are separate from application bugs. Windows/Lenovo acceptance and hosted staging remain separate gates.

Rollback: stop new starts/reward operations, revert UI/API in coordination, retain protected fields, private pools, checkpoints, reward idempotency, saved results and learner safeguards. Do not roll back by re-granting client reward writes or moving trusted keys into public banks. No production rollback is needed because nothing was applied there. The eight Mathematics questions remain drafts with qualified teacher approval pending. Independent hardening review and explicit approval are required before P0-B; this branch does not authorize it.


## Recorded validation

Local validation passed: lint/typecheck, 52 unit tests (including the math trust regression), four plan-flow tests, eight independent draft Mathematics calculations, production build, 104 unauthorized HTTP checks, 13 protected-learner HTTP checks, desktop build, eight SQL suites and four database concurrency scenarios (one-use invite, invite quota, lesson reward and cross-pool publication). The pilot browser suite passed at 360px/1280px, including a server deadline expiring while the browser still showed time: the backed-up A was graded and the late B was ignored. The real GoTrue/PostgREST suite passed private-key denial, checkpoint recovery, reward ownership/idempotency and the existing complete examination/history/security workflow.

[Check outputs](evidence/security/checks.txt), [before audit](evidence/security/npm-audit-before.json), [after audit](evidence/security/npm-audit-after.json), [patched dependency tree](evidence/security/patched-dependency-tree.txt), and [local migration order](evidence/security/local-migration-order.txt) contain reproducible evidence. In the CLI migration-list JSON, the field named `remote` is the history column of the selected **local** stack; `target.kind` is `local`, not a production connection. The new migration is last, after all six integration migrations. CI reruns all suites against a fresh real Supabase stack for the final PR commit.

Screenshots: [server-deadline recovery](evidence/pilot/economics-results-1280.png), [mobile revision](evidence/pilot/results-360.png), and [real persistent history](evidence/integration/real-history-360.png). No real student records, provider calls or hosted migrations were used. The Mathematics draft hash remains `00dd51de285a183ff37366c9df81bf3ce931c79b306884ef8cbc2a9c7b350240`.
