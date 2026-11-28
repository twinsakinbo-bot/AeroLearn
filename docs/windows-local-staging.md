# Windows local staging on a Lenovo laptop

Use a **fresh, separate checkout** of `integration/p0-a-waec-staging`. This setup uses Docker Desktop's Linux containers, Node.js 22 LTS, Git, PowerShell 5.1 or 7, and Supabase CLI 3.x (tested with 3.4.0). No hosted Supabase project, subscription, paid add-on, deploy or main merge is involved. P0-B remains gated on independent acceptance, review and explicit approval.

## Install and prepare

1. Install/start Docker Desktop with the WSL 2 backend and Linux containers. Enable Windows virtualization/WSL if Docker requests it. Check Docker Desktop licensing for your organization; this setup purchases nothing. Allow roughly 10 GB disk space for images and dependencies; the first start downloads several images.
2. Install Node.js 22 LTS and Git for Windows. Install Supabase CLI using the [official Windows instructions](https://supabase.com/docs/guides/local-development/cli/getting-started) or the Windows executable from the official CLI release. Global `npm install -g supabase` is unsupported. Put `supabase.exe` on PATH. The scripts require CLI 3.x, not an older CLI with different configuration semantics.
3. Open PowerShell and verify `docker info`, `node --version`, `git --version`, and `supabase --version`.
4. Clone into a new folder. Do not reuse a production checkout or copy any `.env` file, `.vercel` directory, hosted Supabase link or real data.

```powershell
git clone --branch integration/p0-a-waec-staging --single-branch https://github.com/twinsakinbo-bot/AeroLearn.git AeroLearn-local-staging
Set-Location AeroLearn-local-staging
# If Windows blocks local scripts, allow them only in this PowerShell process:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\Local-Staging.ps1 -Action Setup
```

Setup installs the committed npm lockfile, prepares `.local-staging/runtime/supabase`, starts only its local Supabase stack, applies migrations in order, and provisions synthetic data. No `supabase link`, `db push`, hosted migration or deployment command is used. Setup never resets a database. Running Setup again rotates synthetic passwords and reactivates seeded memberships while preserving exam history/allowances; do not rerun it during a revocation acceptance test.

Generated files are gitignored: `.local-staging/accounts.json` holds eight account identities/passwords plus school/cohort/member IDs; `.local-staging/environment.json` holds local-only environment values. The folder's Windows ACL is restricted to the current user. Keep credentials private; do not attach the files to issues or screenshots. Use `notepad .local-staging\accounts.json` to view credentials locally.

| Account key | Purpose |
| --- | --- |
| `dan` | Retail examination acceptance |
| `operator` | Site admin and explicitly bootstrapped institutional operator |
| `schoolAdminA`, `schoolAdminB` | Separate school administrators, without site-admin privileges |
| `teacherA`, `teacherB` | Teachers assigned only to their own synthetic SS3 cohort |
| `learnerA`, `learnerB` | Protected school learners with aliases SYN-A/SYN-B |

Emails end in `@example.invalid`. Passwords are generated randomly, never fixed or committed. Schools are LOCAL SYNTHETIC SCHOOL A/B. The bank contains 40 clearly labelled synthetic Economics software fixtures with answer A and an explanation. These are for software acceptance, not teaching or a school demonstration. The eight Mathematics questions remain unchanged drafts, excluded from the bank and preview pending qualified teacher approval.

## Start, stop and resume

```powershell
.\scripts\Local-Staging.ps1 -Action Start
```

Keep that terminal open. Visit **http://127.0.0.1:4323/auth/login** and sign in using `dan` from the generated file. The app binds only to loopback. Supabase API is http://127.0.0.1:55421; PostgreSQL is 127.0.0.1:55422. Ports differ from the earlier engineering test stack to avoid mixing data. Local mail capture uses 55424–55426 and never sends real mail. Studio, realtime, external AI and scheduled jobs are not part of this acceptance setup.

Stop the app with **Ctrl+C**, then stop the backend in the same or another terminal:

```powershell
.\scripts\Local-Staging.ps1 -Action Stop
```

Synthetic Docker data is preserved. To resume, run `Start`; do not run Setup again unless intentionally reprovisioning test accounts. `Check` verifies the backend is running and local. If Start reports it cannot find a dependency, rerun `npm ci` in this dedicated checkout. Never use `supabase stop --all`, pause/delete hosted projects or enable billing to resolve a local error.

If Docker is stopped, start Docker Desktop and retry. If ports 4323 or 55420–55426 are occupied, stop the known local process using them; do not point the setup at a hosted URL as a workaround. If the first image download is rate-limited, retry later. A corporate proxy can break container localhost health probes; fix Docker's local proxy bypass configuration, without disabling RLS or changing application endpoints. The earlier managed Linux workspace needed a container-local health-probe workaround; that is not a Windows setup requirement.

## How production is excluded

Every action checks the integration branch, a dedicated runtime ID and fixed local ports. Existing root environment files and hosted project links cause an immediate failure. The runtime verifies the exact API URL and PostgreSQL loopback address returned by local CLI status before using credentials. App startup builds a clean environment instead of inheriting Supabase, email, AI, cron, database or Node injection variables from the shell. It pins the public site and Supabase URLs to localhost, keeps institutional controls local, and forces draft review off. No hosted credential is needed or accepted as configuration. Ordinary `npm run dev` bypasses this launcher: use the PowerShell Start command for acceptance.

## Manual examination acceptance

Record date, commit (`git rev-parse HEAD`), Windows/Docker/Node/CLI versions, browser, viewport, pass/fail, screenshot and relevant local request status. Never capture credentials, tokens or service-role keys. Use desktop width and browser responsive mode at 360px; a phone cannot access this loopback-only setup directly.

- [ ] Sign in as `dan`; open Mock Exams. WAEC Mathematics is unavailable with a clear message. No draft-review button or silent generated replacement appears.
- [ ] Choose Economics and a full mock. Confirm 40 questions and 40 minutes. Select A for question 1 and leave the other 39 blank; navigate forward/back and verify selection survives. Confirm the question navigator/buttons are usable at 360px and desktop width.
- [ ] Open Submit. Cancel and Escape return to the exam with answers retained. Confirm submission saves before displaying results. Expect **1/40**, with blank answers scored zero and explanations on correct and blank items.
- [ ] Open progress/history, reload the page, reopen the attempt and confirm the same score, answers and worked explanations. Sign out/in and confirm history persists.
- [ ] Refresh/revisit the saved results/history and verify no duplicate attempt/reward appears. A second full mock within the week is denied with a clear message; an eight-question short Economics revision remains available.
- [ ] For short revision choose A for all eight questions; expect 8/8 and eight explanations. This is software-fixture scoring, not academic content validation.
- [ ] During an active short attempt, use browser DevTools Network offline mode before submission. Confirm save fails clearly, answers remain and no successful result is shown. Restore network and retry the same attempt; expect one saved result and one progress update. Normal navigation does not resume an unfinished attempt after a browser refresh; keep the answer screen open during a retry.
- [ ] Let a short activity's timer expire and confirm automatic submission/results. Avoid waiting 40 minutes by using the short mode. Check no unrelated paid feature was granted.
- [ ] Complete a mock as `learnerA`; confirm self history works. Sign in as another student/staff account and confirm that attempt is not visible (the explicit site-admin operator retains global administration). School staff history/reporting UI is not included in P0-A.

## Manual institutional security acceptance

P0-A provides typed APIs and security foundations; it does not include a school-management UI. Use the helper below from a second PowerShell terminal while Start is running. Each invocation authenticates with the selected synthetic account and sends only to the fixed localhost app. Expected denied requests appear as HTTP errors in PowerShell.

```powershell
$F = Get-Content .local-staging/accounts.json -Raw | ConvertFrom-Json
.\scripts\Invoke-LocalStagingApi.ps1 -Role schoolAdminA -School A
.\scripts\Invoke-LocalStagingApi.ps1 -Role schoolAdminB -School B
# Expected 403: B cannot read A.
.\scripts\Invoke-LocalStagingApi.ps1 -Role schoolAdminB -School A
# Teacher sees only assigned cohort and roster; learner sees self only.
.\scripts\Invoke-LocalStagingApi.ps1 -Role teacherA -School A
.\scripts\Invoke-LocalStagingApi.ps1 -Role learnerA -School A
# Expected 403: teacher cannot create a cohort.
$Body = @{action='create_cohort';institution_id=$F.schools.A.institution_id;payload=@{name='Forbidden'}} | ConvertTo-Json -Depth 5
.\scripts\Invoke-LocalStagingApi.ps1 -Role teacherA -School A -Method POST -Body $Body
# Expected 403: school learner AI access is blocked before any provider call.
.\scripts\Invoke-LocalStagingApi.ps1 -Role learnerA -Method POST -Path /api/ai-quiz -Body '{}'
# Revoke A's teacher; subsequent school access must fail immediately.
$Body = @{action='revoke_member';institution_id=$F.schools.A.institution_id;payload=@{id=$F.schools.A.members.teacher}} | ConvertTo-Json -Depth 5
.\scripts\Invoke-LocalStagingApi.ps1 -Role schoolAdminA -School A -Method POST -Body $Body
.\scripts\Invoke-LocalStagingApi.ps1 -Role teacherA -School A
```

For a direct foreign-attempt denial check (short mode avoids consuming the full allowance):

```powershell
$Start = @{action='start';requestId=[guid]::NewGuid().ToString();exam='WAEC';subjects=@('Economics');mode='revision'} | ConvertTo-Json
$Attempt = (.\scripts\Invoke-LocalStagingApi.ps1 -Role dan -Path /api/mock-exams -Method POST -Body $Start) | ConvertFrom-Json
$Submit = @{action='submit';attemptId=$Attempt.id;answers=@{}} | ConvertTo-Json
# Expected 403: another school account cannot submit Dan's attempt.
.\scripts\Invoke-LocalStagingApi.ps1 -Role schoolAdminB -Path /api/mock-exams -Method POST -Body $Submit
# Owner succeeds: 0/8 because answers are blank. Retrying returns the same result.
.\scripts\Invoke-LocalStagingApi.ps1 -Role dan -Path /api/mock-exams -Method POST -Body $Submit
.\scripts\Invoke-LocalStagingApi.ps1 -Role dan -Path /api/mock-exams -Method POST -Body $Submit
```

- [ ] School A/B and teachers cannot read the other school's members/cohorts or mutate its resources.
- [ ] Teacher cannot promote themselves, create cohorts or invite staff. Learner sees self membership only. School administrator remains a retail student role globally and cannot use site-admin routes.
- [ ] Revoked teacher loses school scope. The automated real-service test separately verifies revocation using the same JWT; this helper signs in on each request.
- [ ] Learner discovery/community/challenges are blocked; protected learners remain hidden after withdrawal/revocation. Retail account exam access still works.
- [ ] Unauthenticated API access fails; a school ID alone cannot grant access. Another user's mock attempt cannot be submitted or read. Automated SQL/real-service tests cover direct REST writes, forged results and same-token revocation beyond this manual helper.

## Record acceptance and P0-B gate

Write findings in a local review note with expected/actual results, reproduction steps and screenshots. Mark any failure as a blocker. Teacher approval of content and independent engineering acceptance are separate decisions. After independent acceptance testing and review are complete, return the findings for review; **explicit approval must be requested and received before P0-B starts**. This setup does not merge, deploy or authorize P0-B.

Validation performed in engineering: 51 unit tests, lint/typecheck, PowerShell 7 parsing, launcher refusal checks, and a fresh real local Supabase smoke test passed. All eight synthetic logins and seeded school/learner isolation passed. See [validation evidence](evidence/windows-local-staging-checks.txt). Windows PowerShell parsing can be checked independently, but a real Lenovo/Windows/Docker Desktop acceptance run remains required; Linux checks do not certify that environment.
