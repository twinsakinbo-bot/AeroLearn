# Institutional pilot privacy review — not a compliance declaration

No real onboarding is authorized by this document. NDPA/GAID review and written school/owner approval are release gates.

| Decision | Proposed minimum | Required approver / status |
| --- | --- | --- |
| Controller / processor | School determines learner purposes; AeroLearn processes agreed instructions. Identify any separate AeroLearn-controller activity explicitly. | Qualified privacy reviewer and school owner — pending |
| Purpose / lawful basis | Restricted revision and completion support; document applicable basis for each purpose and child-data safeguard. No marketing/profiling reuse. | Privacy reviewer — pending |
| Notice / guardians / withdrawal | Age-appropriate notice and school/guardian authorization where legally required; no default collection of DOB or identity documents. Record consent requirements and withdrawal route outside the learner dataset. | School + privacy reviewer — pending |
| Data minimization | Random account UUID and school-issued alias. School retains identity mapping. No roster email upload, student photos, parent contacts or learner CRM notes. | School staff owner — pending |
| Staff access | Verified adult accounts; separate school admin/teacher/operator permissions; least access, operator allowlist review and incident access logging. | AeroLearn owner — pending |
| Subprocessors / transfers | Review Supabase/Vercel/mail service contracts, hosting regions, international transfer basis, access and backup providers. AI off for protected learners. | Privacy and security owners — pending |
| Retention | Propose deletion within 30 days of agreed pilot close, subject to signed terms. Define shorter withdrawal handling, justified audit retention and account/legacy-content purge. | School + privacy reviewer — pending |
| Backups / tombstones | Document actual backup retention/expiry, restore re-deletion process, and tombstone retention until historic content/backups cannot republish identity. Do not invent a backup expiry period. | Infrastructure owner — pending |
| Access / correction / deletion | Verified school-mediated request; correct alias without importing identity mapping; revoke access immediately; delete cohort memberships and institutional membership; independently handle Auth, retail records, historic content and backups. | Support + privacy owners — pending |
| Incident response | Name school contact, AeroLearn incident commander and privacy lead; stop access, preserve minimal evidence, assess notification duties and document timings. No unassigned operational promises. | AeroLearn + school owners — pending |

Before onboarding, rehearse with synthetic accounts: withdrawal, revocation using an existing token, membership deletion, Auth/content deletion, restore-and-reapply restrictions, and backup expiry. Retain only redacted evidence. The local SQL suite proves restricted membership deletion and persistent profile/message hiding, not the full staging/backup procedure.

Telemetry must omit raw invitation tokens, aliases, emails, answers, prompts and request bodies. Keep invitations in POST bodies and approved adult-only distribution, never URLs/CRM. Disable body/statement capture for these endpoints/RPCs in APM/database logging before release. Application audit records only random IDs/action/time, with database session actor for owner maintenance. Review access and retention of those pseudonymous audit records too.
