# P0-B reproducible verification

Synthetic data only. Local verification used Linux, Node 24.22.3, PostgreSQL 17, Supabase CLI 3.4.0 and Chromium through Playwright. CI uses Node 22 and independent disposable databases. Windows Docker execution and independent P0-B security/acceptance remain separate gates.

| Check | Command | Evidence / result |
|---|---|---|
| Unit and typed HTTP transport | `npm test` | 55 passed, including licensing identity/context/schema/size/error/cache and quota cases. |
| SQL/RLS and all concurrency | `npm run test:db:local` | All nine migrations and ten SQL suites pass. Existing invitation, reward, content-pool and profile races remain green. Nine new deterministic licensing lock barriers pass. |
| Real local Supabase | `npx --yes supabase@3.4.0 start -x realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`, then `npm run test:integration:real` | Actual GoTrue password sign-in/getUser, JWTs, PostgREST, RLS, Next routes and browser flows. Licensing issuance/redemption, school-context mocks, scoring/history, suspension, offboarding, renewal, tenant isolation and retail preservation pass. A focused real-stack rerun additionally verifies read-only operator audit after school deactivation; final CI runs the whole updated suite from a clean stack. |
| Legacy pilot browser | `npm run test:pilot:e2e` | 360px/1280px availability/draft-label/review/dialog/failure recovery/history; 40-item Economics, deadline recovery, concurrent submission and rewards pass. This harness uses a local Auth/PostgREST adapter with real PostgreSQL; it is distinct from real Supabase evidence. |
| Production-mode HTTP auth | `npm run build`, `npm run test:http` | 106 missing/invalid-token checks pass against a local production-mode Next build. No live service probing. |
| Institutional safeguards and disabled licensing | `npm run test:institutional:http` | 16 checks: protected-learner controls, fail-closed guard outage, disabled licensing APIs and not-found page content. Backend spy verifies disabled licensing never accesses business data. |
| Web quality/build | `npm run lint`, `npm run typecheck`, `npm run build` | Pass. |
| Desktop retail compatibility | `npm ci --prefix desktop-app`, `npm run desktop:check` | Pass (TypeScript/Vite). |
| Mathematics draft integrity | `npm run test:math-review` | Eight calculations/options/explanations independently checked; hash unchanged `00dd51de285a183ff37366c9df81bf3ce931c79b306884ef8cbc2a9c7b350240`. DRAFT / teacher approval pending. |
| Dependencies | `npm audit --json` | 0 critical/high/moderate, 4 existing low KaTeX-related advisories; no dependency changes. |
| Windows script syntax and local isolation | Parse both `.ps1` scripts with PowerShell parser; `npm test` local-staging guards | Both parse; hosted/disguised endpoints, hosted links and inherited production/provider credentials rejected. This does not assert execution on Windows. |

## New deterministic barriers

`tests/licensing-concurrency.mjs` opens actual PostgreSQL sessions, observes `pg_blocking_pids`, and releases a held lock only after the competing request is blocked. It proves:

1. Two requests for the last seat cannot both reserve it.
2. An issuance retry creates one batch/reservation and never rediscloses a secret.
3. Two learners cannot redeem one code.
4. Concurrent same-learner retries produce one grant.
5. A queued claim observes committed membership revocation with the same JWT.
6. A queued claim observes code expiry after its statement began.
7. Concurrent activation cannot duplicate the pool.
8. A queued institutional mock start observes term expiry.
9. Two final issuance-quota requests cannot both succeed, even with spare seats.

Policy suites additionally verify manual approval/activation roles, changed retry payload refusal, foreign school/cohort denial, no client writes, private verifier/generic-RPC denial, suspended grants, explicit offboarding/reclaim/reassignment, cancellation, new-term renewal, 1,200-seat aggregate completeness, failed-guess quota persistence, cancelled-batch quota accounting, same-JWT staff revocation, read-only inactive-school operator history, default-off switches, retention pruning and preserved retail balances/lifetime access.

## Screenshots and test interpretation

See [operator desktop](operator-1280.png), [school admin mobile](school-admin-360.png), [learner mobile](learner-360.png) and [learner desktop](learner-1280.png). These are actual local real-Supabase sessions with synthetic identities; raw codes were cleared before capture. They use the development server; fixed navigation in full-page captures is not a second UI or a deployment.

An initial browser selector was ambiguous because a wrapping select label included option text. Explicit accessible names fixed it; the real workflow was rerun successfully. Initial CI also assumed disabled pages always return HTTP 404: Next can stream a parent layout then render `notFound()` with status 200. The regression now checks the actual not-found payload and absence of licensing UI; disabled APIs must still return 404 with no backend calls. No authorization rule was weakened to accommodate this framework behavior.

The managed rootless Docker environment is slow; the local Auth/Storage container health-check proxy workaround from the integration notes applies only to that disposable environment. It is not a Windows requirement or an application bug. No hosted Supabase project, preview, production credential or student data was used.

Final GitHub Actions results are linked from the draft PR description for its exact head. They cover database, web, desktop, pilot-browser and real-supabase jobs, including the updated inactive-school checks. Independent OpenBot/Dan verdicts are not represented as CI results.
