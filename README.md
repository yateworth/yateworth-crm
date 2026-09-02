# Yateworth Recruitment CRM

Built per `docs/Recruitment_CRM_Build_Specification.md`, in gated phases.

- **Milestone 1 (foundation)** — done. Authentication, staff profiles/roles,
  Row Level Security, audit log.
- **Milestone 2 (permission ledger)** — done. `communication_preferences`,
  `consent_events`, `suppression_entries`, and the `can_send_email()`
  eligibility check every future send has to run.
- **Milestone 3 (anonymous survey)** — done. The real Australian Legal
  Survey question set (matching `survey-form.html` on the marketing site),
  a public read endpoint, a public submission endpoint, and a separate
  report/permission endpoint — proven, by schema and by test, to never
  share an identifier with the survey answers. **Wired up live**: the
  marketing site's `survey-form.html` calls these endpoints directly
  (survey itself still `draft`, so not publicly reachable yet).
- **Milestone 4 (campaigns)** — done. Templates, mailing lists, campaign
  recipient snapshots with an eligibility preview, and atomic batch
  claiming (`claim_campaign_batch`, `FOR UPDATE SKIP LOCKED`) that
  re-checks `can_send_email()` at claim time — not just at preview time —
  so an opt-out between preview and send is actually caught. Sending goes
  through a fake email provider (`netlify/functions/_shared/emailProvider.ts`)
  since no real provider account exists yet.
- **Milestone 5 (unsubscribe + bounce/complaint)** — done. A public,
  no-login unsubscribe endpoint using signed tokens; bounce/complaint
  webhook processing that's genuinely signature-verified (a made-up but
  real HMAC scheme on the fake provider — swap for the real vendor's when
  one exists) and idempotent (a duplicate webhook delivery has no
  duplicate effect); a hard bounce or complaint blocks every purpose;
  three soft bounces in 30 days trigger the same. **Spec deviation,
  disclosed**: `record_unsubscribe` takes an already-verified email
  identity rather than a raw token — see the note at the top of
  migration 12.
- **Milestone 6 (report delivery + reporting)** — done. Report delivery
  mirrors the campaign batch-claiming pattern (`claim_report_batch`,
  `record_report_delivered`); `survey_aggregate_report()` withholds the
  real count for any answer given by fewer than 5 respondents, flagging
  it as suppressed rather than silently hiding it, per the spec's
  "no figure from fewer than five responses, and say where we have done
  it"; `dashboard_summary()` gives the operational counts from the
  spec's dashboard list that exist at this milestone. **A real
  vulnerability was found and fixed while building this** — see the
  "Security fix" note below before reading anything else about this
  milestone.

**Live at [yateworth-crm.netlify.app](https://yateworth-crm.netlify.app)**
— GitHub → Netlify continuous deployment is connected and verified (two
real test pushes, both auto-deployed correctly). Connected to a real
(free-tier) Supabase project. Not connected yet: Apollo, or a real email
provider.

## Security fix (found 2026-09-02, while building Milestone 6)

`admin_add_suppression` (live since Milestone 2) and three campaign
functions (`generate_campaign_recipients`, `claim_campaign_batch`,
`record_email_sent`, live since Milestone 4) did not correctly enforce
their admin/marketing-only restriction for a caller with **no active
profile row at all** — a brand new sign-up nobody has approved yet, or a
deactivated account. Two distinct bugs:

1. `IF current_app_role() <> 'admin'` (and the equivalent `NOT IN (...)`
   form) silently evaluates to `NULL` when the caller has no profile, and
   PL/pgSQL's `IF` treats a `NULL` condition as false — so the guard
   never fired. Verified live before fixing:
   `select current_app_role() <> 'admin';` returned `NULL`, not `true`.
2. `generate_campaign_recipients`, `claim_campaign_batch` and
   `record_email_sent` had **no role check at all** — only the blanket
   `GRANT EXECUTE ... TO authenticated`, meaning any authenticated user
   regardless of role or active status could call them.

Both fixed in `supabase/migrations/20260902000015_fix_role_check_gaps.sql`
with an explicit `is null or` check, and `supabase/tests/role_check_regression.sql`
proves all 8 affected functions now correctly reject an unauthorised
caller — checking the actual error message, not just "an exception was
thrown," so a function failing for the wrong reason would still show as
a failure. Whether this gap was exploited before the fix: profile
creation requires a real Supabase Auth sign-up, and this project has had
exactly one real user (you) for its entire existence, so the realistic
exposure window was effectively nil — but the bug was real regardless of
whether anyone hit it.

## A testing gap, found and fixed (2026-09-02, while building Stage 2)

Every `supabase/tests/*.sql` file in this repo runs via
`scripts/run-remote-sql.cjs`, which authenticates to the Supabase
Management API with a personal access token. That connection executes as
Postgres role `postgres` — which has `rolbypassrls = true`. Verified live:

```sql
select rolbypassrls from pg_roles where rolname = current_user; -- true, as postgres
```

That means every test that exercised a **SECURITY DEFINER function**
(`can_send_email`, `claim_campaign_batch`, `record_unsubscribe`, all of
Milestones 2-6, `create_candidate`) was still testing something real —
those functions' `current_app_role()` checks are plain SQL conditionals
reading a JWT claim, correct regardless of which role calls them. But
**no test had ever verified an actual RLS table policy** — and Stage 1's
Candidates/Firms screens (and now Stage 2's activities/tasks) read and
write `firms`/`people`/`candidate_profiles`/`email_addresses`/
`activities`/`tasks` directly from the client, with no function in
between. Their correctness depended entirely on RLS policies nothing had
verified.

Fix: `supabase/tests/direct_table_rls.sql` starts with `set local role
authenticated`, which actually drops the bypass (`rolbypassrls = false`
as `authenticated`) — a real regression test, not just a plausible-looking
one. It confirms a caller with no active profile row sees zero rows and
cannot insert into any of the six tables above. All 9 assertions pass.

A second, smaller bug this surfaced: an RLS-blocked `UPDATE` affects zero
rows *silently* — it does not raise an exception. An early version of
the `activities`-is-append-only test used `exception when others` to
detect a blocked update, which never fires for this failure mode; it was
rewritten to check the row's actual content afterward instead. Every
`*.sql` test file that does a direct-table write for a genuine
positive-path check (not just probing an unauthorised case) should be
read with this in mind.

## Stack

React + TypeScript + Vite + Tailwind, deployed to Netlify (static site +
serverless functions), backed by Supabase (Postgres + Auth + Storage + Row
Level Security).

**Visual design matches the marketing site**, not a generic admin-panel
look. `src/index.css`'s `@theme` block ports the marketing site's exact
tokens (`--ink`, `--ox`, `--brass`, `--sec`, etc. from `my-site/index.html`'s
`:root`) into Tailwind v4 utilities (`bg-ox`, `text-ink`, `font-display`,
...) — keep the two in sync if the marketing site's palette changes.
`index.html` loads the same Source Serif 4 / Archivo Google Fonts pairing.

## What exists right now

- `src/` — Supabase browser client, auth context, a login page, and a
  protected dashboard that shows real operational data
  (`lib/reporting.ts` wraps `dashboard_summary()`/`survey_aggregate_report()`).
  `types/database.ts` is now machine-generated from the live schema
  (`npx supabase gen types typescript --project-id <ref>`) rather than
  hand-maintained — the file says so at the top; the `AppRole` alias at
  the bottom is the one hand-authored part, re-add it after regenerating.
- `netlify/functions/` — the pattern for server-side code (secrets never
  reach the browser). `health.ts` confirms env vars are set;
  `send-campaign-batch.ts` claims and "sends" a campaign batch through
  the fake provider, gated to an active admin/marketing session;
  `unsubscribe.ts` is the public no-login unsubscribe endpoint;
  `email-webhook.ts` receives and verifies bounce/complaint/delivery
  events; `_shared/emailProvider.ts` is the fake provider adapter (real
  signature verification, fake sending); `_shared/unsubscribeToken.ts`
  signs/verifies the unsubscribe links, unit-tested against tampering and
  expiry.
- `supabase/migrations/` — extensions/enums, `profiles` + roles + RLS,
  audit logging, the minimal `firms`/`people`/`email_addresses`/
  `candidate_profiles` tables needed to seed fictional data, an
  audit-trigger bugfix, the permission ledger (`communication_preferences`,
  `consent_events`, `suppression_entries`, `can_send_email()`,
  `admin_add_suppression()`), the corrected all_marketing/report
  interaction, the anonymous survey (`surveys`, `survey_questions`,
  `survey_options`, `survey_responses`, `survey_answers`,
  `report_requests`, `get_active_survey()`, `submit_survey_response()`,
  `submit_permission_request()`) plus the real Legal Survey question data,
  campaigns (`mailing_lists`, `email_templates`, `campaigns`,
  `campaign_recipients`, `email_messages`, `email_events`,
  `generate_campaign_recipients()`, `claim_campaign_batch()`,
  `record_email_sent()`), unsubscribe/bounce processing
  (`record_unsubscribe()`, `process_email_event()`), report delivery and
  reporting (`claim_report_batch()`, `record_report_delivered()`,
  `survey_aggregate_report()`, `dashboard_summary()`), the role-check
  security fix (see above), `create_candidate()`, `activities`/`tasks`
  (append-only activities, assignable/completable tasks), and
  `jobs`/`submissions` (the candidate pipeline, stage-tracked).
- `supabase/seed/seed.sql` — fictional firms/people/candidates only.
- `supabase/tests/permission_ledger.sql`, `supabase/tests/anonymous_survey.sql`,
  `supabase/tests/campaigns.sql`, `supabase/tests/unsubscribe_and_bounces.sql`,
  `supabase/tests/report_delivery_and_reporting.sql`,
  `supabase/tests/role_check_regression.sql`,
  `supabase/tests/create_candidate.sql`,
  `supabase/tests/activities_and_tasks.sql`,
  `supabase/tests/direct_table_rls.sql`,
  `supabase/tests/jobs_and_submissions.sql` — SQL assertions run against
  the real database (see "Testing against the live database" below),
  including a schema-level proof that `survey_responses`/`survey_answers`
  carry no identity column and `report_requests` carries no
  survey-response reference.

Nothing beyond this exists yet — no jobs, submissions, real email sending
(the fake provider is used everywhere), report delivery, or Apollo
integration. Those land in the rest of Phase 1 (Milestone 6) and Phase 2
per the spec.

## Getting this running for real

Right now `.env` has placeholder values, so `npm run dev` boots but every
Supabase call fails — that's expected. To make it real:

### 1. Create a Supabase project

Sign up at [supabase.com](https://supabase.com) (free tier is enough to
start) and create a project. From **Project Settings → API**, copy:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon / public key** → `VITE_SUPABASE_ANON_KEY`
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (server-only — see
  the warning below)

Put the two `VITE_` values in `.env` (already gitignored). Do **not** put
the service role key in `.env` for local dev unless you're also running
`netlify dev`; it should really only ever live in Netlify's environment
variable settings once deployed.

### 2. Run the migrations against it

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This applies the three migrations in `supabase/migrations/`. To also load
the fictional seed data:

```bash
npx supabase db reset --linked
```

(`db reset` re-applies every migration and then the seed file — safe on a
fresh project, destructive on one with real data, so only use it in
development.)

### 3. Create your own login

Supabase Auth needs at least one real user before anyone can sign in.
Easiest path: in the Supabase dashboard, **Authentication → Users → Add
user**, create yourself with a password. A `profiles` row is created for
you automatically (via the `handle_new_auth_user` trigger) with role
`viewer` and `active = false`. Then, in the **SQL Editor**, promote
yourself:

```sql
update profiles set role = 'admin', active = true where id =
  (select id from auth.users where email = 'you@example.com');
```

### 4. Run it

```bash
npm install
npm run dev
```

Sign in at `/login` with the account you created above.

### 5. Deploy

Already done — see "Continuous deployment" below for the one remaining
manual step (linking to GitHub for auto-deploy on push). To redeploy
manually in the meantime:

```bash
npm run build
npx netlify-cli@17 deploy --prod --dir=dist --functions=netlify/functions
```

(Needs `NETLIFY_AUTH_TOKEN` set, or `netlify login` run once interactively.)

## Continuous deployment

The site (`yateworth-crm.netlify.app`) and all its environment variables
were created via the Netlify CLI, using a personal access token — same
pattern as the Supabase setup. One thing the CLI can't do non-interactively:
linking the site to this GitHub repo for auto-deploy on push, since that
requires an OAuth grant only you can click through. To finish that:

1. [Site overview → Project configuration → Build & deploy → Continuous deployment](https://app.netlify.com/projects/yateworth-crm)
2. **Link repository** → choose GitHub → authorize Netlify if prompted →
   select `yateworth/yateworth-crm`, branch `main`
3. Confirm build command `npm run build`, publish directory `dist`,
   functions directory `netlify/functions` (all already set via
   `netlify.toml` — Netlify should detect these automatically)

Until that's done, deploys only happen when someone runs the manual
`netlify deploy --prod` command above.

**Also worth knowing:** the site was created with Netlify's account-wide
"Team protection" (SSO-gated visitor access) on by default, which I
turned off for this site specifically — it would have blocked the public
survey/unsubscribe/webhook endpoints along with everything else. If you
ever want visitor-level access control back (e.g. before real data flows
through it), that's a deliberate choice to make explicitly, not something
to leave on by an account default.

## Wiring up the live site

`survey-form.html` on the marketing site calls `submit_survey_response`
and `submit_permission_request` directly over Supabase's public REST API
(anon key only — no secret involved, no Netlify function needed for this
flow). Verified live: the rejection path (survey still `draft`) and a
real successful submission both round-tripped correctly through the
actual browser. The survey itself is still `status = 'draft'`, so it's
not publicly reachable yet — flip it with the SQL in
`supabase/migrations/20260902000008_seed_legal_survey.sql`'s header
comment once the pay bands and a real closing date are set.

`knowyourworth.html` (the salary-check tool) is **not** wired up. It
combines email and answers together intentionally — the whole point is
that a person gets a reply — so it doesn't fit the anonymous survey
tables at all, and needs its own backend piece that doesn't exist yet.

I've deliberately held off doing this rewrite until you confirm you want
it — it's a real (small) code change to a page that's already live and
publicly promising anonymity, so it's worth reviewing rather than me
quietly redeploying it.

## Testing against the live database

There's no Docker here, so `supabase test db` (which needs local Postgres)
isn't available. Instead, `scripts/run-remote-sql.cjs` runs a `.sql` file
against the linked project via the Supabase Management API, using a
personal access token — never the database password or service role key.
Every file under `supabase/tests/` wraps its assertions in
`BEGIN`/`ROLLBACK`, so running them against a real project never leaves
data behind (verified — see the migration 2 commit).

```bash
# Get a token from supabase.com/dashboard/account/tokens — this is a
# session-only export, never put it in a file.
export SUPABASE_PROJECT_REF=<your-project-ref>
export SUPABASE_ACCESS_TOKEN=<your-personal-access-token>

npm run db:test -- supabase/tests/permission_ledger.sql
```

Any line in the output starting `FAIL` means an assertion didn't hold;
the script also exits non-zero in that case.

**Read "A testing gap, found and fixed" above before writing a new test
file.** The Management API connection runs as `postgres`, which bypasses
RLS entirely. Testing a SECURITY DEFINER function's internal logic is
unaffected by this. Testing an actual RLS table policy is not — start
the transaction with `set local role authenticated` (see
`supabase/tests/direct_table_rls.sql`), and remember that an RLS-blocked
`UPDATE` fails *silently* (zero rows affected, no exception), so check
the row's content afterward rather than wrapping it in a `begin/exception`
block.

## Local Postgres (optional, needs Docker)

`supabase/config.toml` is set up for `npx supabase start`, which runs a
full local Postgres + Auth stack in Docker — useful for iterating on
migrations without touching the hosted project. Not required; the hosted
free-tier project above is enough on its own.

## Commands

```bash
npm run dev         # local dev server
npm run typecheck   # tsc, no emit
npm run lint        # oxlint (includes accessibility rules)
npm run test         # vitest
npm run build        # production build
npm run validate     # typecheck + lint + test + build, in order
```

## Security notes (read before adding any integration)

- The browser only ever gets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
  Every other secret in `.env.example` is read only inside
  `netlify/functions/`, via `netlify/functions/_shared/env.ts`.
- Row Level Security is enabled on every table from the first migration
  onward, default deny. New tables in later phases must ship with RLS
  policies in the same migration that creates them.
- `profiles.active` defaults to `false` for every new sign-up — an admin
  has to deliberately activate an account and assign its role. There is no
  self-service path to CRM access.
- `audit_log` and `consent_events` are append-only (no application role
  has update/delete grants on either).
- `communication_preferences` and `suppression_entries` have no client
  insert policy at all — the only way a client role can write to them
  right now is `admin_add_suppression()` (creating a suppression) and the
  admin-only RLS update policy for lifting one. Every other write path
  (the public permission endpoint, unsubscribe, bounce/complaint webhooks)
  is a SECURITY DEFINER function added in a later milestone, by design.
- **Decided:** an active `all_marketing` suppression does **not** block
  `report`. A report is a single thing the person explicitly requested in
  its own separate action — transactional, not an ongoing marketing send
  — so unsubscribing from marketing shouldn't cancel a report they
  separately asked for. Only `all_email` (hard bounce, complaint) blocks
  every purpose including report. See
  `supabase/migrations/20260902000006_report_survives_all_marketing.sql`.

## What's still ahead (see the spec for full detail)

- **Phase 1 remaining**: Apollo staging, CSV import/export.
- **Dashboard now shows real data**: report requests/opt-ins/active
  suppressions/campaign+message status (from `dashboard_summary()`), and
  a per-question breakdown of the Legal Survey (from
  `survey_aggregate_report()`) with the suppression threshold visibly
  applied. Admin/marketing only — a recruiter/viewer sees a plain
  "not available to your role" message instead of an error.
- **Still no UI** for actually *doing* anything with campaigns,
  suppressions or report delivery (creating a campaign, lifting a
  suppression, triggering `send-campaign-batch`) — the dashboard is
  read-only so far. Those functions all exist and are tested, just not
  wired to a screen yet.
- **Candidates and Firms are now full CRM screens**, per
  `docs/crm-functionality-plan.md` Stage 1: detail pages
  (`/candidates/:id`, `/firms/:id`) showing every column the schema has —
  LinkedIn, admission jurisdictions, desired locations, work preferences,
  salary current/expected, availability date, source, privacy notice
  status, last-contacted — not just the handful the first pass exposed.
  Edit in place, archive/restore (existing `record_status` column, no new
  migration needed), and a "log contact now" / "mark privacy notice
  given" quick action on each candidate. `create_candidate()` (Milestone
  "CRM screens" commit) is atomic across `people`/`email_addresses`/
  `candidate_profiles`, and correctly reuses an email the marketing site
  already captured (survey/report requests) rather than erroring or
  creating a duplicate person — see the comment in migration 16 for what
  stays out of scope (real duplicate/near-match detection across
  non-identical records is an explicit Phase 2 deliverable in the spec).
- **Stage 2 (activities, notes, tasks)** — done. `activities`
  (append-only — no client role, not even the author, can update or
  delete one after it's logged) and `tasks` tables, both fully specified
  in the original spec but never migrated until now. Every
  candidate/firm detail page has an activity feed (log a call/email/note)
  and a task list (create, assign to self, mark done) scoped to that
  record. The dashboard's new "My tasks" card shows what's due today or
  overdue for the signed-in user — one of the spec's own dashboard items
  (section 12) that didn't exist before this.
- **Real testing-methodology gap found and fixed while building Stage 2**:
  see "A testing gap, found and fixed" below before trusting any RLS
  claim in this README for tables written to directly from the client
  (as opposed to through a function).
- **Stage 3 (jobs + candidate pipeline)** — done. `jobs` (belongs to a
  firm) and `submissions` (candidate × job, `submission_stage` tracked:
  longlist → shortlist → submitted → interview → offer → placed/rejected/
  withdrawn), both fully specified in the original spec but never
  migrated until now. A job's detail page is a simple column-per-stage
  board — not drag-and-drop, a stage select per candidate card, per the
  plan's own scoping. A candidate's detail page shows every job they've
  been submitted to. `direct_table_rls.sql`-style testing (`set local
  role authenticated`) used from the start this time, not retrofitted.
- **Stage 4 (surveys as their own page)** — done, completing the
  original 4-stage plan in `docs/crm-functionality-plan.md`. New
  `list_surveys()`/`set_survey_status()` functions (migration 20 —
  `list_surveys` is admin/marketing read, `set_survey_status` is
  admin-only, both raising an explicit exception for an unauthorised
  caller rather than the silent-empty-result shape a first draft of
  `list_surveys` had). `/surveys` lists every survey; `/surveys/:slug`
  shows the full `survey_aggregate_report()` breakdown with an
  admin-only open/draft/closed toggle, replacing the manual SQL update
  that used to be the only way to open the Legal Survey. The dashboard's
  survey section is now a one-line summary card linking into that page
  instead of the full inline breakdown.
- **Campaigns finally have a screen, and a real approval gate they didn't
  have before** (migration 21). The Milestone 4 campaign backend
  (`generate_campaign_recipients`, `claim_campaign_batch`,
  `record_email_sent`) existed since early in this project but was only
  ever exercised via SQL/API calls — see `/marketing/lists`,
  `/marketing/templates` and `/marketing/campaigns` for the screens that
  now sit on top of it. Two things were found and fixed while building
  this, not just UI added on top of what was already correct:
  - `claim_campaign_batch` never checked a campaign's approval status —
    the spec's own decision order ("Does the campaign itself remain
    approved?") was silently unenforced, so anyone able to call the
    function could drain a campaign's send queue whether or not it had
    been approved. New `approve_campaign()` (admin-only) is now the only
    way `approved_at`/`approved_by` get set, and `claim_campaign_batch`
    refuses to claim anything until that's happened - both covered by
    `supabase/tests/campaigns_management.sql`.
  - `send-campaign-batch.ts` sent `email_templates.html_template`/
    `text_template` completely raw - the signed-token unsubscribe
    endpoint built back in Milestone 5 was live and tested, but nothing
    in the actual send path ever linked to it. Every send now gets an
    unsubscribe footer appended server-side
    (`netlify/functions/_shared/emailFooter.ts`, unit-tested) - not a
    merge tag a template author has to remember to paste in.
  - New `sync_mailing_list_members()` populates a list from a
    `dynamic_filter` (a schema column that existed since Milestone 4 but
    nothing ever read). Three segment kinds for this pass, disclosed
    scope: everyone opted into a purpose (blog/recruitment/report),
    candidates by status, candidates by practice area. A real
    arbitrary-condition segment builder is a lot more machinery than
    three list types need right now; a fourth kind is a small addition
    to the same function later, not a rewrite.
- **Firm contacts and a firm-level relationship stage** (migration 22).
  Two gaps raised directly by the user: firms had no way to record the
  actual people at them (HR manager, hiring partner), and no field
  tracked the agency's standing commercial relationship with a firm
  separately from job-level pipeline. New `firm_contacts` join table
  reuses `people` rather than a parallel contact record - so a firm
  contact automatically gets activities/tasks, and (since it's the same
  `email_addresses` table the mailing-list segments already read from)
  is automatically eligible for mailouts too, no separate system needed.
  `create_firm_contact()` mirrors `create_candidate()`'s exact shape,
  including reusing an existing email rather than creating a duplicate
  person. New `relationship_stage` enum column on `firms` (prospect →
  contacted → terms sent → terms signed → dormant) - kept deliberately
  separate from `job_status`/`submission_stage`, which track per-role
  pipeline and already existed; one firm can have many jobs under a
  single standing agreement, which is exactly why this needed its own
  field rather than reusing job status. `FirmDetail` shows/edits both;
  the firms list shows the stage as a column.
- **Rules-based insights on the dashboard** (migration 25) - chosen over
  an LLM-powered version specifically to keep candidate/firm data inside
  this database rather than sending it to an external API on every
  dashboard load, with no ongoing API cost either. `insights_dashboard()`
  (admin/recruiter only) surfaces three plain-SQL signals: candidates not
  contacted in 30+ days, jobs open 45+ days with zero submissions, and
  firm relationships (contacted/terms sent/terms signed - not already
  marked dormant) with no logged activity in 60+ days. Each item links
  straight to the record. An LLM-powered version remains a possible
  later layer on top of this, not a replacement for it.
- **Placement and fee tracking** (migration 24). `placements` from the
  original spec's Phase 3 schema, minus `offer_id` (no `offers` table
  exists yet - not asked for here, small addition later if it's built).
  One placement per submission, RLS matches submissions exactly
  (recruiter/admin only, no viewer - fee amounts are as sensitive as
  anything else in the pipeline). New `/placements` page: total
  placements/total fees/outstanding fees at a glance, a form to record a
  placement against any submission at the 'placed' stage that doesn't
  have one yet, and an inline invoice-status control
  (not_invoiced/invoiced/paid/written_off) per row. `JobDetail`'s
  pipeline board links a placed card straight to it.
- **Direct one-off email from a candidate's page**, distinct from a
  campaign send on purpose: `can_send_email()`'s opt-in ledger exists for
  marketing/bulk sends where consent tracking is the point, but ordinary
  1:1 correspondence with your own candidate was never gated behind an
  opt-in checkbox and rehoming it there would have blocked email to
  most candidates (added directly by a recruiter, not through the
  marketing site, so most never get a `communication_preferences` row at
  all). New `netlify/functions/send-direct-email.ts` checks only the one
  suppression that always matters regardless of purpose - `all_email`
  (hard bounce/complaint/legal request) - sends through the same
  provider abstraction as campaigns, and logs the message to both
  `email_messages` (audit trail) and the candidate's own activity feed.
  No unsubscribe footer, for the same reason a personal email from a
  colleague doesn't carry one.
- **Candidates got a kanban board** alongside the existing list view (a
  List/Board toggle on `/candidates`) - columns per `candidate_status`
  (prospective/active/submitted/placed/inactive), a stage-change select
  on each card, matching the same pattern `JobDetail`'s pipeline board
  already used for submissions.
- **Marketing rebuilt around ad-hoc filtering instead of named lists**
  (migration 23), directly on user feedback: "I don't want to manually
  create lists, I want to basically be able to send an email based on
  whether the candidate or firm contact or practice area and PQE -
  like filterable." `select_segment_email_ids()` replaces migration 21's
  three separate segment "kinds" with one compound filter (contact type -
  candidate/firm contact/bare-email subscriber/any -, practice areas,
  PQE range, candidate status, opted-in purpose, all AND-combined) built
  once and shared by a live count function, list-sync, and a new
  one-step `/marketing/compose` screen: filter, watch the recipient
  count update, pick a template, and it creates the campaign - the
  mailing list still exists underneath (campaigns need one, and it keeps
  the approve/send machinery from the campaigns work above untouched)
  but is never something the user has to name or manage directly.
  `/marketing/lists` keeps a "smart list" option, built on the same
  compound filter, for a segment worth saving and reusing rather than
  rebuilding each time.
  **A real regression found while migrating the tests**: the old
  `opted_in` kind matched any email address with the right consent
  regardless of whether it had a person record at all; the first version
  of the compound filter accidentally required a `people` row to match
  anything, which would have silently dropped the plain email-only
  audience (subscribers who only ever came through the marketing site's
  survey/report form - see `email_addresses.person_id` being nullable
  by design in migration 3) from every future filter. `contact_type:
  'subscriber'` restores that branch explicitly; the old test file's
  assertions (still 8/8 passing) caught this the moment the new
  behaviour was run against it, which is exactly why they were updated
  and rerun rather than deleted along with the old filter shape.
- **Gmail sync — in progress**, full plan in `docs/crm-functionality-plan.md`
  under "Gmail sync (separate initiative)". `gmail_connections` table is
  live: holds OAuth tokens, deliberately has zero policies for any client
  role (not even admin) — only a Netlify function using the service role
  can ever touch it, verified live (`supabase/tests/gmail_connections.sql`).
  The from/to/cc → candidate matching logic
  (`netlify/functions/_shared/gmailMatching.ts`) is built and unit-tested
  (11 tests) independent of any real Gmail data. **Not built yet**: the
  actual OAuth flow and the sync function — both need a Google Cloud
  project only you can create (steps are in the plan doc).
- **Phase 2 remaining**: matching, Apollo promotion, duplicate/near-match
  detection.
- **Phase 3**: interviews, offers, placements, fee tracking.
- **Not in the spec at all yet**: a backend for `knowyourworth.html` (see
  "Wiring up the live site" above).

Each phase is its own gated milestone — validate and review one before
starting the next, per the spec's own workflow.
