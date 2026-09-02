# Make the CRM actually functional (candidates, firms, surveys, activity)

## Context

Milestones 1-6 built the compliance/marketing-ops backend (permissions, anonymous survey, campaigns, unsubscribe, reporting) plus two thin CRM screens (Candidates, Firms) added as a fast follow when it became clear the dashboard alone didn't feel like a CRM.

Direct feedback on those two screens: fields are missing, nothing is clickable, it isn't "fully functioning" yet. Concretely:

- **The add-candidate form and candidate list only expose 7 of the ~14 columns `candidate_profiles`/`people` actually have** — no LinkedIn, no admission jurisdictions, no desired locations, no work preferences, no salary (current/expected), no availability date. Firms are missing legal name, address, and size band. There's no way to see or edit a record's full detail, and no way to edit or archive anything at all — only add and list.
- **The survey section on the dashboard is static text.** There's no way to click into it, manage the survey (open/close it), or see it as its own thing rather than a widget bolted onto the dashboard.
- **No activity/notes/tasks anywhere** — the single feature that makes a CRM feel like a CRM rather than a database viewer. `activities` and `tasks` are in the original build spec's schema (section 6) but were never migrated, since Milestones 1-6 scoped strictly to Phase 0/1 (the spec's own phase boundary put the full candidate/firm/job CRM in Phase 2).
- **No jobs or pipeline** — `jobs`, `submissions` (the spec's stage-tracked candidate-to-job pipeline) don't exist yet either. This is the other half of "it's a CRM."

Full HubSpot parity (deal forecasting, sequences, a report builder, a marketplace of integrations) is not a realistic target for this project and I'm not going to pretend otherwise. What's realistic and worth building is the set of patterns that actually make HubSpot feel good to use: a record has a detail page showing everything about it, you can edit and archive it, you can log activity and notes against it, you can see what's due, and related records (a candidate's firm, a job's candidates) are one click away. That's the target.

## Stages

Building and shipping this the same way Milestones 1-6 went: one stage at a time, pushed and verified (SQL assertions against the live database, `npm run validate` locally, a real check on the deployed site) before moving to the next, rather than one giant undifferentiated change. Each stage is independently useful even if we stop after it.

### Stage 1 — Full-detail Candidates & Firms: detail pages, complete forms, edit, archive

The most direct fix for "can't see all the fields."

- **`/candidates/:id` and `/firms/:id` detail pages.** Every column on `people`/`candidate_profiles`/`email_addresses` and `firms` respectively, organised into a couple of readable sections rather than one giant form. List rows become links (`react-router-dom`'s `<Link>`, already a dependency) into these.
- **Add and edit use the same form component** (`CandidateForm`, `FirmForm`), covering every field the schema has — LinkedIn, admission jurisdictions, desired locations, work preferences, salary current/expected, availability date for candidates; legal name, address, size band for firms. Array fields (practice areas, jurisdictions, etc.) stay the comma-separated-input pattern already used, kept consistent rather than introducing a tag-picker component for this pass.
- **Archive**, not delete — both tables already have a `status` column (`record_status`: `active`/`archived`) from Milestone 1; a button on the detail page flips it, and the list view filters to active by default with a toggle to show archived. No new migration needed for this part.
- **Edit** goes through the existing RLS-permitted direct table update (`supabase.from('firms').update(...)`, `supabase.from('people').update(...)` + `candidate_profiles`) — these are single-purpose authenticated writes already covered by the admin/recruiter RLS policies from Milestone 1, no new database function required. Editing a candidate's email is explicitly out of scope for this pass (email identity touches consent/suppression history — changing it needs the same care `create_candidate` gives new emails, and isn't worth rushing).

### Stage 2 — Activity timeline, notes, and tasks

The feature that actually makes this feel like a CRM rather than a form over a database.

- **New migration**: `activities` (immutable-ish timeline: `activity_type`, `subject_type`/`subject_id` polymorphic reference, `body`, `occurred_at`, `created_by`) and `tasks` (`title`, `subject_type`/`subject_id`, `assigned_to`, `due_at`, `status`, `completed_at`) — both already fully specified in the build spec's section 6 schema, just never migrated. RLS: admin/recruiter read-write (matches candidates/firms), matching the pattern already established (`current_app_role() is null or ... not in (...)` — written correctly this time, not the buggy form fixed in migration 15).
- **On both detail pages**: an activity feed (notes appear here; a "log a call/note" quick-add) and a small task list scoped to that record (create a follow-up task, mark it done).
- **Dashboard gets a "My tasks" card**: overdue and due-today tasks assigned to the signed-in user, one of the items from the spec's own dashboard list (section 12) that doesn't exist yet.

### Stage 3 — Jobs and the candidate pipeline

The recruiter-specific equivalent of HubSpot's deal pipeline.

- **New migration**: `jobs` (belongs to a firm; title, status, practice area, PQE range, salary range) and `submissions` (candidate x job, `submission_stage` enum already defined in the spec: `longlist → shortlist → submitted → interview → offer → placed`/`rejected`/`withdrawn`). RLS matches firms/candidates (admin/recruiter).
- **`/jobs` list + `/jobs/:id` detail** showing the firm, the role, and a simple column-per-stage board of submitted candidates (click a candidate to move them to the next stage — a plain select/button per card is enough for a first pass, not full drag-and-drop).
- **From a candidate's detail page**, a "submit to job" action creates a `submissions` row, so the two record types are actually linked, the way a HubSpot contact and deal are.

### Stage 4 — Make the survey section its own real thing

Fixes "surveys aren't clickable."

- **`/surveys` page**: lists surveys (right now just the one), click through to `/surveys/:slug` for the full `survey_aggregate_report()` breakdown, expandable per question, with a status toggle (open/close) calling a small new `set_survey_status()` function instead of requiring raw SQL — closing the loop on the manual step currently documented in the README.
- **Dashboard's survey card becomes a summary + link** into that page rather than the full static dump it is now.

## Verification (every stage)

- New/changed SQL: a `supabase/tests/*.sql` file run via `node scripts/run-remote-sql.cjs` against the live project, wrapped in `BEGIN`/`ROLLBACK` (the pattern used throughout Milestones 2-6) — including a check that the new RLS role-check functions correctly reject an unauthorised caller, given the real bug that pattern already produced once (migration 15).
- `npm run validate` (typecheck + lint + test + build) locally before every push.
- After deploy, a live check of the actual page in the browser pane where credentials aren't required (redirect-when-logged-out, error states), and a request for you to click through the authenticated parts I can't reach without your password — same division of labour as every other milestone so far.
- Commit and push each stage separately so continuous deployment ships them incrementally, matching how Milestones 1-6 went.

## Sizing expectation

Stage 1 is the most direct fix for what you flagged today and the best place to start. Stages 2-4 are each a comparable amount of work to a single milestone from Phase 1 (a migration + RLS + a test file + one or two screens) — sizeable individually, so I'd plan to stop and show you Stage 1 before continuing, the same way each earlier milestone got checked before the next one started.

---

# Gmail sync (separate initiative, started after Stage 3)

## Context

You asked, mid-Stage-3, for a way to link your actual Gmail account to the CRM. Decided: full email sync (not just a "BCC to log" pattern), and full email bodies stored and shown in the activity feed, not just subject/snippet — the HubSpot-like experience of reading a whole thread inside the CRM.

This is a real, separate feature from the four CRM stages above — it needs a Google Cloud project, an OAuth flow, token storage, and an ongoing sync job, none of which the CRM has any of yet. It also means email content (candidate and firm correspondence) will live in this project's Supabase database long-term, which is worth being deliberate about.

## What only you can do first

Same category as creating the Supabase/Netlify/GitHub accounts earlier in this project — I can't create a Google Cloud project or click through Google's consent screens on your behalf.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project (or use an existing one).
2. **APIs & Services → Library** → enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (unless your Gmail is on a Google Workspace domain, in which case **Internal** is available and simpler)
   - Add scope `https://www.googleapis.com/auth/gmail.readonly`
   - Under **Test users**, add your own Gmail address
   - Leave publishing status as **Testing** for now — see the caveat below
4. **APIs & Services → Credentials** → Create Credentials → **OAuth client ID** → Application type **Web application** → Authorized redirect URI: `https://yateworth-crm.netlify.app/api/gmail-oauth-callback`
5. Copy the **Client ID** and **Client Secret** and paste them here (same handling as every other secret this session — used only to configure Netlify env vars, never saved to a file or committed) once you're ready for me to wire it up.

**Real caveat to accept up front**: while the app is in Google's "Testing" publishing status (the only option that skips Google's manual verification review, which needs a live privacy policy page and can take weeks), Gmail refresh tokens expire after **7 days** — you'll need to click "Connect Gmail" again about once a week. Moving to "In production" removes this but requires that verification review. Starting in Testing mode and revisiting this if the weekly reconnect becomes annoying is the pragmatic choice here.

## Design

- **`gmail_connections` table** (new migration): one row per connected profile — `profile_id`, `google_email`, `access_token`, `refresh_token`, `token_expires_at`, `last_synced_at`, `last_history_id`. No SELECT/INSERT/UPDATE policy for any client role at all — this is more sensitive than anything else in the database so far (it's the key to someone's actual inbox). Only Netlify functions (service role) ever touch it, following the same pattern as `record_unsubscribe`/`process_email_event` in migration 12.
- **`netlify/functions/gmail-oauth-start.ts`**: redirects the browser to Google's OAuth consent URL with the right scope and a `state` parameter tied to the signed-in user (verified via the same bearer-token pattern `send-campaign-batch.ts` already uses).
- **`netlify/functions/gmail-oauth-callback.ts`**: exchanges the returned code for tokens via Google's token endpoint, upserts the row in `gmail_connections`, redirects back to a "Connected" state in the CRM.
- **`netlify/functions/gmail-sync.ts`**, run on a schedule (Netlify Scheduled Functions, configured in `netlify.toml` with a cron expression - e.g. every 15 minutes): for each connected profile, refreshes the access token if needed, calls the Gmail API's `messages.list` filtered to `after:<last_synced_at>`, fetches each new message's full content, extracts From/To/Cc addresses, matches them against `email_addresses.email` to find a `person_id`, and logs an `activities` row (`activity_type = 'email'`, `subject_type = 'people'`, `body` = the email content, `metadata` = `{gmail_message_id, thread_id, subject, from, to}`) against the matching candidate. Reuses the `activities` table Stage 2 already built and its existing RLS (admin/recruiter read, append-only) — no new activity-visibility rules needed.
  - **v1 scope, disclosed**: only matches to `people` (candidates and any other person record), not firms directly — firm-level contact matching needs the spec's `firm_contacts` table (person ↔ firm ↔ role), which doesn't exist yet. A reasonable v2 addition once that table exists, not blocking v1.
  - **v1 scope, disclosed**: uses `messages.list` with an `after:` date filter rather than the more robust (but more complex) `history.list` + `historyId` incremental-sync API. Simpler to get right first, and fine at this project's email volume; worth revisiting only if sync starts missing messages or becomes slow.
- **UI**: a small "Email sync" section on the Dashboard (or its own `/settings` page) showing connection status (connected as `<email>` / not connected), a "Connect Gmail" button (hits `gmail-oauth-start`), and a "Sync now" button for an on-demand run alongside the scheduled one.
- **Activity feed already renders `body`** (built in Stage 2) — a synced email just shows up there like any manually-logged note, with `activity_type = 'email'` distinguishing it visually (e.g. an envelope icon or different label).

## Verification

- `supabase/tests/gmail_connections.sql`: `set local role authenticated`, confirm no client role (including admin) can read/write `gmail_connections` directly — only the service-role path should work, and that can't be exercised from this SQL test channel (matches how `record_unsubscribe`/`process_email_event` are handled).
- The address-matching logic (email → person_id) is pure function logic worth a Vitest unit test independent of any real Gmail data, similar to `unsubscribeToken.test.ts`.
- The actual OAuth flow and sync can only be verified live, with your real Google account connected — I'll need you to click "Connect Gmail" and authorize it yourself (another `AskUserQuestion`-gated, "only you can click this" step), then confirm a real email shows up in a candidate's activity feed.
- `npm run validate` before every push, same as every prior stage.

## Sizing

This is bigger than any single stage above — a new external service, a new auth flow, a scheduled background job, and a new sensitive-data table. Building it in its own sub-steps (table + RLS test, OAuth start/callback, then the sync function, then the UI), verifying each before the next, the same discipline as Milestones 1-6 and Stages 1-3.
