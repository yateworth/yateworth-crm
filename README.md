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
  share an identifier with the survey answers.

Connected to a real (free-tier) Supabase project. Not connected yet:
Netlify, Apollo, or an email provider. The marketing site's survey pages
don't call these endpoints yet — see "Wiring up the live site" below.

## Stack

React + TypeScript + Vite + Tailwind, deployed to Netlify (static site +
serverless functions), backed by Supabase (Postgres + Auth + Storage + Row
Level Security).

## What exists right now

- `src/` — the app shell: Supabase browser client, auth context, a login
  page, a protected dashboard route.
- `netlify/functions/` — the pattern for server-side code (secrets never
  reach the browser). `health.ts` is a working example that just confirms
  env vars are set.
- `supabase/migrations/` — extensions/enums, `profiles` + roles + RLS,
  audit logging, the minimal `firms`/`people`/`email_addresses`/
  `candidate_profiles` tables needed to seed fictional data, an
  audit-trigger bugfix, the permission ledger (`communication_preferences`,
  `consent_events`, `suppression_entries`, `can_send_email()`,
  `admin_add_suppression()`), the corrected all_marketing/report
  interaction, and the anonymous survey (`surveys`, `survey_questions`,
  `survey_options`, `survey_responses`, `survey_answers`,
  `report_requests`, `get_active_survey()`, `submit_survey_response()`,
  `submit_permission_request()`) plus the real Legal Survey question data.
- `supabase/seed/seed.sql` — fictional firms/people/candidates only.
- `supabase/tests/permission_ledger.sql`, `supabase/tests/anonymous_survey.sql`
  — SQL assertions run against the real database (see "Testing against the
  live database" below), including a schema-level proof that
  `survey_responses`/`survey_answers` carry no identity column and
  `report_requests` carries no survey-response reference.

Nothing beyond this exists yet — no jobs, submissions, campaigns, or
Apollo integration. Those land in Phase 1 (Milestones 4-6) and Phase 2 per
the spec.

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

## Wiring up the live site (not done yet)

The marketing site's `survey-form.html` and `knowyourworth.html` currently
run in "preview mode" — their `ENDPOINT`/`CONTACT_ENDPOINT` variables are
empty, so submissions just show a thank-you screen and go nowhere. The
functions in this repo (`get_active_survey`, `submit_survey_response`,
`submit_permission_request`) are callable right now over Supabase's
public REST API using only the anon key — no Netlify function needed for
this particular flow, since none of it touches a secret. Two things stand
between that and actually working:

1. **The payload shape doesn't match yet.** The site's JS currently
   `POST`s a flat object with the site's own field names
   (`state`/`role`/.../`submitted_at`) straight to `ENDPOINT`. Supabase's
   RPC endpoint (`/rest/v1/rpc/submit_survey_response`) expects a JSON
   object whose keys match the function's parameter names
   (`p_slug`, `p_answers`, `p_broad_source`) — so the site's submit
   handler needs a small rewrite to build `p_answers` as a nested object
   and call the two endpoints with `apikey`/`Authorization` headers set
   to the anon key, not just a bare `fetch(ENDPOINT, ...)`.
2. **The survey is still `status = 'draft'`** in the database (not
   reachable via `get_active_survey`) until you're ready to actually go
   live — flip it with the SQL in the migration's header comment when
   the pay bands and closing date are set.

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

- **Phase 1**: anonymous survey, report requests, consent/suppression
  ledger, mailing lists and campaigns, unsubscribe flow, bounce/complaint
  webhooks, Apollo staging.
- **Phase 2**: full candidate/firm/job CRM, matching, Apollo promotion,
  duplicate detection.
- **Phase 3**: submissions, interviews, offers, placements, fee tracking.

Each phase is its own gated milestone — validate and review one before
starting the next, per the spec's own workflow.
