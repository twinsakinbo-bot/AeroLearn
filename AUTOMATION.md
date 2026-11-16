# AeroLearn scheduled work

Production Vercel Cron calls three protected routes using `CRON_SECRET`:

The admin can monitor recent results and run a job immediately at `/admin/automation`. A manual run processes the same bounded batch as a scheduled run. Receipt approval remains in `/admin/subscriptions`.

| Time (UTC) | Route | Work |
| --- | --- | --- |
| 23:00 UTC daily (00:00 Africa/Lagos) | `/api/automation/lessons` | Up to three NERDC sourced lesson steps: plan, write, or independent AI review. Approved reviews publish lessons; rejected drafts stay for revision. |
| 23:00 UTC daily (00:00 Africa/Lagos) | `/api/automation/aloc` | Fetch one ALOC exam/subject/year batch, remove questions flagged by AI review, and import only new questions. |
| 23:00 UTC daily (00:00 Africa/Lagos) | `/api/automation/status-email` | Email the admin the receipt queue and latest completed content job results. Because all three start together, the email may describe the previous runs. |

Submitting a transfer receipt also requests an immediate admin email. **Only an admin checks payment and approves a plan.** A failed email does not discard the receipt; the daily digest still lists it.

Required production secrets: `CRON_SECRET`, `COARENA_API_KEY`, `ALOC_ACCESS_TOKEN`, and `RESEND_API_KEY`. Set `ADMIN_NOTIFICATION_EMAIL` to override the admin account's email address. The AI tutor's **Search web** option requires `BRAVE_SEARCH_API_KEY`; it returns a clear setup error until that key is present. **Quiz me** needs no additional key.

The lesson job only writes topics verifiable in an official NERDC document. At present NERDC's revised JSS 3 and SS 3 PDF paths are unavailable, so those classes appear as source errors in the admin digest. The job skips them instead of inventing curriculum coverage. The daily lesson limit keeps gateway costs and timeouts bounded; completing every subject will take multiple days.

Automatic run times live in `vercel.json` as UTC cron expressions. To change the daily hours, edit those three entries and deploy the change. On Vercel Hobby, each job can run once daily, with scheduling precision of about one hour. The admin **Run now** buttons work at any time. For the web search key, create a Brave Search API key at `https://api-dashboard.search.brave.com/app/keys`, add it as the server-only `BRAVE_SEARCH_API_KEY` in Vercel Production environment variables, then redeploy.
