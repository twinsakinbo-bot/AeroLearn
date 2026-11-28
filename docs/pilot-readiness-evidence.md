# P0 pilot readiness: implementation and evidence

This branch is based on `94a9c104e70310c10098204ebd6c2f2e4b70eee6`. It implements the urgent Section 6 work independently of [institutional P0-A PR #1](https://github.com/twinsakinbo-bot/AeroLearn/pull/1). P0-B has not started. No deployment, production migration, production data write or real student test was performed. Branch deployment is disabled in `vercel.json`.

## Findings

Dan's [handoff](https://docs.google.com/document/d/1Kn-Lj3Q-va5CEbMfmH-CGyidzA63HFVZQfWZmUqTreI/edit) was read, including updated Section 6. A read-only aggregate of question metadata found zero WAEC Mathematics questions, 209 JAMB Mathematics, 7 Post-UTME Mathematics, and 82 WAEC Economics questions. All 82 Economics rows had letter answer keys; none had worked explanations. No student records or live question text were retrieved.

The old availability probe checked one arbitrary bank row, not the selected board/subject. Exact string filters and an importer that only trimmed names could miss aliases. The setup and runtime timer descriptions differed. Submission, result writes and rewards were separate client operations; a failure could leave incomplete persistence. Correct-answer review hid explanations. The mobile fixed navigator overlapped content.

Dan reaching a native confirmation dialog does not establish a submission bug: browser control stopped there. Our replacement uses an accessible HTML dialog and automated cancel, Escape and confirm tests. Local test-adapter token/grant/JSON-null mistakes were corrected in the harness; they were not application findings.

## Implementation

- A normalized, RLS-respecting question view and typed availability API validate usable four-option questions for each exam/subject. Missing and failed bank loads have distinct, retryable messages. Drafts cannot enter student availability or ordinary imports. Canonical mappings include WACE/WASSCE to WAEC and maths/general mathematics to Mathematics.
- Import replacements retain stable IDs and use atomic writes instead of deleting the original before a potentially failed insert. Server validation complements client normalization.
- Private PostgreSQL attempt snapshots own answer keys, timing and selected questions. Start requests have stable request IDs so a lost response can recover without consuming another weekly allowance. Submission scores stored answers, atomically saves the immutable worked review and progress/rewards, and returns the same result on retries. Caller identity is verified server-side. Foreign attempts and direct authenticated writes to authoritative result sources are denied.
- Full mocks select up to 40 questions per subject, at one minute per question. Short revision uses up to eight for one subject independently of the full-mock allowance. The UI awaits persistence, retains unsaved answers after failure and supports retry, timer expiry and history after reload. Existing retail result types remain supported.
- Correct and incorrect answers both show available explanations. Existing Economics content without explanations is explicitly identified; no AI answer is substituted. The timer is formative: delayed submission is accepted for network recovery, not a high-stakes proctoring guarantee. Existing legacy client-controlled aggregate fields are not certified institutional reporting.

## Original draft Mathematics content

Eight original SS3 revision questions cover linear algebra, quadratics, variation, plane/coordinate geometry, trigonometry, probability and statistics. Each has four options and a worked solution. They are original WAEC-style practice, not official WAEC past questions. No third-party question was copied.

[Teacher review document](https://docs.google.com/document/d/18y-oL4L6qV80tj3oPHNBnAZkZYqf2QJD1U5-OAjxU1I/edit) and [repository review copy](ss3-mathematics-teacher-review.md) contain all questions, answers, solutions and the approval form. Content lives in `content/drafts/ss3-waec-mathematics-v1.json`, with `publicationStatus: draft` and no teacher approval. SHA-256: `00dd51de285a183ff37366c9df81bf3ce931c79b306884ef8cbc2a9c7b350240`.

Independent Python checks use substitution, root enumeration, rational arithmetic, polygon area, trigonometry, enumerated probability outcomes, mean deviations and coordinate distance. All eight keys and calculations pass. This is mathematical verification, not teacher approval. Teacher review must confirm curriculum suitability, wording and solutions before publication or school demonstration.

A private rehearsal requires an authenticated site administrator, `MOCK_DRAFT_REVIEW_ENABLED=true` and a non-production Vercel environment. It exposes an explicitly labelled draft preview without consuming allowances or awarding progress/rewards. The flag defaults off. The set has not been imported or published.

## Reproduction and results

Use Node 22, npm, Python 3 and Docker. These commands use disposable PostgreSQL and synthetic accounts, never linked Supabase credentials:

```sh
npm ci
npx playwright install --with-deps chromium
npm run lint
npm run typecheck
npm test
npm run test:plans
npm run test:math-review
npm run test:db:local
npm run build
npm run test:http
npm run test:pilot:e2e
```

Local results: lint/typecheck/build passed; 46 unit tests, four plan-flow tests, eight independent Mathematics checks, six SQL suites, and 102 missing/invalid-token HTTP checks passed. Browser tests passed at 360px and 1280px. See [check evidence](evidence/pilot-checks.txt) and [browser summary](evidence/pilot/e2e-summary.txt).

The browser harness starts a real Next app and PostgreSQL migration/RLS stack. Auth and PostgREST transport are local adapters. Synthetic UUIDs ending in 1, 2 and 3 represent reviewer, student and other account; 40 invented Economics fixtures are testing data, not teaching material. It verifies draft denial for students, missing Mathematics, eight-question preview, dialog cancel/Escape/confirm, injected save failure and successful retry, correct/unanswered scoring, explanations for all eight items, persisted history after reload, and no horizontal overflow. It also runs a complete 40-question Economics browser submission, recovers a deliberately lost start response, exercises timer auto-submit, and verifies concurrent duplicate submissions produce one result and one progress/reward update. Foreign-account access is denied and the full weekly allowance does not block short revision.

Screenshots: [mobile availability](evidence/pilot/availability-360.png), [mobile active question](evidence/pilot/active-360.png), [mobile confirmation](evidence/pilot/confirmation-360.png), [mobile results](evidence/pilot/results-360.png), [mobile history](evidence/pilot/history-360.png), [desktop results](evidence/pilot/results-1280.png), [40-question Economics results](evidence/pilot/economics-results-1280.png). CI also uploads fresh browser evidence.

## Remaining gates and rollback

Teacher approval is pending. The live Mathematics bank remains empty and existing Economics explanations remain absent. Hosted Supabase Auth/PostgREST and a real designated Test-account staging rehearsal have not been verified by the local adapter tests. These are explicit readiness blockers, not passing claims. No school demo publication or production change is authorized by this PR.

Before an approved release, test on isolated staging with the real Auth/PostgREST service and reviewed content. Coordinate this independent migration with P0-A review; no P0-B work is included.

Rollback: leave the draft flag off; stop new attempt creation and revert the UI/API release together if needed. Retain private attempt snapshots, saved results and authoritative-result protections so completed work and retries are not lost. Do not drop tables or remove RLS as a rollback. Restore the previous importer code only after stopping imports; retain stable-ID data. Any production migration/deployment and subsequent rollback execution need separate authorization. No production rollback is currently necessary because nothing was applied there.
