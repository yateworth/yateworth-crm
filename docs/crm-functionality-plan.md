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
