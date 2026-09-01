# Yateworth Recruitment CRM

Built per `Recruitment_CRM_Build_Specification.md`, in gated phases. This is
**Phase 0: foundation** — authentication, staff profiles/roles, Row Level
Security, and the audit log. No recruitment, survey or campaign features
yet; no live Supabase/Netlify/Apollo/email-provider credentials are wired
in yet.

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
- `supabase/migrations/` — three migrations: extensions/enums, `profiles` +
  roles + RLS, audit logging, and the minimal `firms`/`people`/
  `email_addresses`/`candidate_profiles` tables (with RLS) needed to seed
  fictional data.
- `supabase/seed/seed.sql` — fictional firms/people/candidates only.

Nothing beyond this exists yet — no jobs, submissions, surveys, campaigns,
consent/suppression tables, or Apollo integration. Those land in Phase 1
and Phase 2 per the spec.

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
- `audit_log` is append-only (no application role has update/delete grants
  on it).

## What's still ahead (see the spec for full detail)

- **Phase 1**: anonymous survey, report requests, consent/suppression
  ledger, mailing lists and campaigns, unsubscribe flow, bounce/complaint
  webhooks, Apollo staging.
- **Phase 2**: full candidate/firm/job CRM, matching, Apollo promotion,
  duplicate detection.
- **Phase 3**: submissions, interviews, offers, placements, fee tracking.

Each phase is its own gated milestone — validate and review one before
starting the next, per the spec's own workflow.
