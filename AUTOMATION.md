# AeroLearn scheduled work

Production Vercel Cron calls three protected routes using `CRON_SECRET`:

| Time (UTC) | Route | Work |
| --- | --- | --- |
| 01:00 daily | `/api/automation/lessons` | Up to three NERDC sourced lesson steps: plan, write, or independent AI review. Approved reviews publish lessons; rejected drafts stay for revision. |
| 02:00 daily | `/api/automation/aloc` | Fetch one ALOC exam/subject/year batch, remove questions flagged by AI review, and import only new questions. |
| 09:15 daily | `/api/automation/status-email` | Email the admin the receipt queue and latest content job results. |

Submitting a transfer receipt also requests an immediate admin email. **Only an admin checks payment and approves a plan.** A failed email does not discard the receipt; the daily digest still lists it.

Required production secrets: `CRON_SECRET`, `COARENA_API_KEY`, `ALOC_ACCESS_TOKEN`, and `RESEND_API_KEY`. Set `ADMIN_NOTIFICATION_EMAIL` to override the admin account's email address. The AI tutor's **Search web** option requires `BRAVE_SEARCH_API_KEY`; it returns a clear setup error until that key is present. **Quiz me** needs no additional key.

The lesson job only writes topics verifiable in an official NERDC document. At present NERDC's revised JSS 3 and SS 3 PDF paths are unavailable, so those classes appear as source errors in the admin digest. The job skips them instead of inventing curriculum coverage. The daily lesson limit keeps gateway costs and timeouts bounded; completing every subject will take multiple days.
