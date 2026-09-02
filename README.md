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

Connected to a real (free-tier) Supabase project. Not connected yet:
Netlify (as a deployed site — the functions exist but aren't hosted
anywhere), Apollo, or a real email provider.

## Stack

React + TypeScript + Vite + Tailwind, deployed to Netlify (static site +
serverless functions), backed by Supabase (Postgres + Auth + Storage + Row
Level Security).

## What exists right now

- `src/` — the app shell: Supabase browser client, auth context, a login
  page, a protected dashboard route.
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
  `record_email_sent()`), and unsubscribe/bounce processing
  (`record_unsubscribe()`, `process_email_event()`).
- `supabase/seed/seed.sql` — fictional firms/people/candidates only.
- `supabase/tests/permission_ledger.sql`, `supabase/tests/anonymous_survey.sql`,
  `supabase/tests/campaigns.sql`, `supabase/tests/unsubscribe_and_bounces.sql`
  — SQL assertions run against the real database (see "Testing against the
  live database" below), including a
  schema-level proof that
  `survey_responses`/`survey_answers` carry no identity column and
  `report_requests` carries no survey-response reference.

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

### 5. Deploy (when ready)

Connect this repo to [Netlify](https://netlify.com) (free tier). In
**Site settings → Environment variables**, set every variable from
`.env.example` — the `VITE_` ones plus the server-only ones
(`SUPABASE_SERVICE_ROLE_KEY`, `APOLLO_API_KEY`, etc., as those integrations
get built in later phases). Netlify builds and deploys automatically on
every push to `main`, the same way GitHub Pages did for the marketing
site — the difference is Netlify also runs `netlify/functions/*` as
serverless endpoints and keeps the secret env vars server-side.

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

- **Phase 1 remaining**: report delivery + safe aggregate reporting
  (Milestone 6), Apollo staging, CSV import/export.
- **Phase 2**: full candidate/firm/job CRM, matching, Apollo promotion,
  duplicate detection.
- **Phase 3**: submissions, interviews, offers, placements, fee tracking.
- **Not in the spec at all yet**: a backend for `knowyourworth.html` (see
  "Wiring up the live site" above).

Each phase is its own gated milestone — validate and review one before
starting the next, per the spec's own workflow.
