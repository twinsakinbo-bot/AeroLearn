# P0-A and WAEC integration readiness

Integration branch: `integration/p0-a-waec-staging`. Inputs: PR #1 `16d1e7fe4b35c52f29cb16ab3eec844b0e750024` and PR #2 `04340091eef4cea1168d810c2bef8b0eddc891e2`. Both are incorporated; main is untouched. No P0-B work is included.

## Joint review and reconciliation

Five merge conflicts were resolved: `.env.example`, `.gitignore`, `package.json`, `tests/run-database-tests.sh`, and `vercel.json`. Both feature flags default off, both HTTP test scripts remain, all seven SQL suites and the invitation concurrency check run, and automatic deployments remain disabled for both feature branches and this integration branch. The workflow retains database, web, desktop and pilot browser checks and adds real local Supabase integration. PR #2's pinned Playwright/pg dependencies and lockfile are retained; no conflicting runtime dependency versions exist.

Security review found a direct-profile-write bypass of the weekly mock allowance. The new final migration rejects client changes to `lastMockExamDate`, including document RPC writes, while server-owned starts still work. The original shared profile role/subscription guard and institutional privacy policies remain in place. Answer keys remain in private attempt snapshots until submission; retry scoring and saved results remain atomic. Tenant privileges use live membership rows; preview or JWT metadata cannot grant school privileges. Draft preview remains administrator-only and explicitly separate from published banks. Site administrators retain their existing global administrative capabilities; school administrators receive no site-admin role.

Both implementations operate on existing retail tables; migration order matters. Verified order is baseline `0001_init`, `0002_licence_codes`, `0003_security_hardening`, then institutional `20261128030853`, mock `20261128032720`, and integration allowance guard `20261128040652`. No filenames collide. The baseline must precede the security migrations. The original SQL bootstrap tests alone do not prove real Auth or PostgREST compatibility; the added real-stack test covers that boundary.

## Hosted staging blocker and cost boundary

The AeroLearn organization (`jfqmataxqisvxadvqffn`) reports Free. Supabase quoted $0/month for a new project, but creation of `aerolearn-staging` was rejected because its owner has reached the two-active-free-project limit. No staging project was created. Neither existing project was paused, deleted, migrated or upgraded. No paid add-on or subscription was enabled. No existing credentials were reused.

Per the user's fallback instruction, staging testing uses isolated local Supabase. A hosted Dan acceptance preview has not been deployed: there is no isolated hosted backend, and pointing a hosted preview at production would violate the task. No claim of hosted staging readiness is made. A free project slot or a separately authorized free staging backend is required before that part can proceed. Provider plan/usage and free preview eligibility must be rechecked then; stop on any nonzero charge.

## Reproduce combined checks

Node 22, npm, Python 3, Docker and Chromium are required. No production secrets are needed.

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
```

Run browser scripts sequentially because Next writes a shared `.next` directory. The real test accepts only localhost API/DB ports 54321/54322; it creates synthetic GoTrue users, real signed JWTs, two schools and invented software question fixtures. It never reads or seeds the Mathematics draft into the bank. Re-running the real test requires a fresh local database (`supabase db reset --local` with CLI help checked first), because synthetic emails are intentionally unique and school fixtures persist. It starts and stops its Next process; Supabase remains available for inspection. `npx --yes supabase@3.4.0 stop` stops only this local stack.

## Dan's local acceptance preview

The local stack is the available free acceptance route. Run the commands above in an isolated checkout. Generate local environment values from `supabase status -o env` into a gitignored file; do not paste keys into evidence or PRs. Map API_URL to NEXT_PUBLIC_SUPABASE_URL, ANON_KEY to NEXT_PUBLIC_SUPABASE_ANON_KEY, and SERVICE_ROLE_KEY to SUPABASE_SERVICE_ROLE_KEY. Use NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4322, INSTITUTIONAL_MVP_ENABLED=true and MOCK_DRAFT_REVIEW_ENABLED=false. Start `npm run dev -- --hostname 127.0.0.1 --port 4322`. Never copy production credentials. External AI/email/import/payment keys and cron secret should be absent. After the integration test, run `node scripts/prepare-local-preview.mjs` to write separate local credentials and create Dan's synthetic account. The script refuses to overwrite an environment file, accepts only the local backend, and stores the random password in gitignored `.env.dan.local` with mode 600. Convey it privately and never commit credentials.

Acceptance: sign in with the synthetic retail account; confirm Mathematics unavailable; complete a short Economics software-fixture mock; submit; verify score and explanation; reload progress and expand saved history. The full mock has 40 questions and a weekly allowance, so use a fresh synthetic account if consumed by automated tests. School foundations have API tests, not a school management UI. Staff access/revocation can be rehearsed through the documented typed institutional API. These software fixtures are not suitable for a school teaching demo.

The eight original Mathematics questions remain draft with teacherApproval null and the unchanged content hash recorded in the teacher review document. Qualified teacher approval remains required before publication or any school demonstration. A private administrator draft review may be enabled locally solely for teacher review; it awards no learning progress or rewards.

## Rollback and remaining gates

Disable both application preview flags and the institutional database control to stop new school commands; retain protected learner tombstones, RLS, privacy guards, audit and saved mock results. Stop new attempt creation and revert UI/API together if necessary. Preserve snapshots for retries and history. Do not drop schemas or remove safeguards as rollback. No production rollback is required because nothing was applied there.

Remaining gates: hosted free slot/backend; free isolated protected preview; Dan's acceptance; qualified teacher approval; genuine licensed/reviewed live Mathematics bank and Economics explanations; production migration/deployment approval. All are separate from successful local integration tests.

Managed workspace note: Docker health probes inherited an HTTP proxy and received 403 from the proxy for localhost. The local services themselves answered API requests. Start the CLI with localhost excluded from proxying in such environments. This is separate from application behavior. The first local Auth configuration used the deprecated email enable_signup field; the committed configuration enables the email provider and disables public signup independently.

## Observed combined results

All combined local checks passed: lint, typecheck, production build, 49 unit tests, four plan-flow tests, eight independent Mathematics calculations, seven SQL suites plus concurrent invite acceptance, 102 unauthenticated/invalid-token HTTP checks, 13 protected-learner HTTP checks, desktop build, and the 360px/1280px mock browser suite. Real local Supabase testing also passed: password sign-in/getUser, PostgREST JWT/RLS, tenant isolation, immediate revocation, protected-learner safeguards, draft denial, retry-safe 40-question scoring, concurrent exactly-once progress, foreign result denial and persisted worked history on both widths. See [combined check log](evidence/integration/combined-checks.txt), [real-service summary](evidence/integration/real-supabase-summary.txt), [mobile real-service history](evidence/integration/real-history-360.png), and [desktop real-service history](evidence/integration/real-history-1280.png).

The local preview was prepared at http://127.0.0.1:4322 using its own synthetic acceptance account and local-only keys. This URL is local to the workspace, not a remote Dan link. The setup script keeps drafts disabled. Hosted acceptance remains blocked. Dependency audit had no critical/high findings, with four low and two moderate existing transitive findings; no forced breaking dependency upgrade was applied.

For this workspace's proxy-injected Docker environment, health probes needed a container-local wget wrapper that unsets proxy variables before calling the original wget. Both health endpoints then returned success. This affected only the disposable Auth/Storage containers; no service implementation or Auth/PostgREST request was mocked. Ordinary Docker environments should use the checked-in configuration directly.
