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

## Full review, bugs found and fixed, mock data added (2026-09-03)

A ground-up review of everything built so far — every SECURITY DEFINER
function's grants, the AI assistant's request loop, the jobs pipeline UI,
the campaigns UI — plus a realistic mock dataset (firms at every
relationship stage, candidates at every status, jobs at every status
including one deliberately stale and one deliberately unrecorded, a
placement, activities, tasks, a campaign) inserted directly into the live
database so the app has something real to click through, rather than an
empty shell. Six real issues found; all fixed and re-tested.

**1. A second, more subtle case of the same "PUBLIC grant" issue from
Milestone 6, plus a related discovery this project hadn't hit before**:
a systematic audit of `information_schema.routine_privileges` across
every SECURITY DEFINER function turned up four more functions whose own
code comments already claimed to be locked down but weren't —
`apply_permission_preference` (no internal role check at all, relies
entirely on its wrapper `submit_permission_request`, so direct access
lets anyone forge an "opted in" consent record — **consent forgery**),
`process_email_event` (the webhook-ingestion function; direct access
lets anyone forge bounce/complaint/unsubscribe events for arbitrary
message IDs — **webhook forgery**), `record_unsubscribe` (meant to be
reached only via a signed, single-use token; direct access defeats that
model entirely), and `can_send_email` (correctly grants `authenticated`
by design, but had also leaked to `anon`). Fixing this exposed a second
gap in the *fix itself*: revoking EXECUTE from `anon`/`authenticated`
alone wasn't enough for `process_email_event` — it was still callable,
because Postgres resolves privileges cumulatively, and the function
still had an EXECUTE grant to `PUBLIC` (the implicit grant Postgres
gives every new function). An explicit per-role revoke does not
override a standing `PUBLIC` grant; `PUBLIC` itself has to be revoked
too, same as the `select_segment_email_ids` fix in Milestone 6. All four
fixed in `supabase/migrations/20260902000031_security_fixes.sql`
(extended from its Milestone-6 version), and `supabase/tests/security_fixes.sql`
now has 8 assertions — checking specifically for Postgres's
`insufficient_privilege` (42501) error, not just "some exception was
thrown," so a function rejecting a call for an unrelated reason can't
read as a false pass. Confirmed the legitimate paths still work:
`submit_permission_request` (the real, anonymous-safe entry point for
consent) still reaches `apply_permission_preference` fine, and
`can_send_email` still works for authenticated staff-UI eligibility
previews. Two other SECURITY DEFINER functions with the same loose
`PUBLIC` grant, `handle_new_auth_user` and `rls_auto_enable`, were
checked and are not exploitable regardless — both are trigger functions
(`RETURNS trigger` / `RETURNS event_trigger`), and Postgres refuses to
call a trigger function outside actual trigger context.

**2. The AI assistant (`netlify/functions/ai-chat.ts`) could return an
empty response and then error out on the next message.** If the model
still only wanted to call a read tool when the 4-round loop cap was hit
(or, more generally, any path ending with no final text and no proposed
action), the function returned `{ text: null, actions: [] }`. The client
replays the whole conversation as plain text on the next turn (a
deliberate simplification — see the comment at the top of the file), so
that empty response became an empty-content message in the next request,
which the Anthropic API rejects — poisoning the conversation until the
page was reloaded. Fixed: falls back to a plain "I couldn't complete
that — try asking again or rephrasing." whenever both `finalText` and
`writeActions` end up empty.

**3. The same file also spliced free text into PostgREST `.or()` filters
unescaped**, in both the `search_candidates` read tool and the
target-resolution lookups in `resolveWriteActions`. PostgREST's `.or()`
groups conditions with `(` `)` and separates them with `,` — a comma or
parenthesis in a name the model extracted from the user's message (or
just pasted from a candidate's email signature) would break the query,
either erroring or matching unintended rows. Fixed with a
`sanitizeForOrFilter()` helper that strips those characters before they
reach the filter string; harmless to strip since none of them are
meaningful in a person's name search.

**4. Two state bugs in `JobDetail.tsx`,** both from React Router reusing
the same component instance across `/jobs/:id` navigations rather than
remounting it: (a) `feeForm` (the inline fee-recording form added
alongside the "record fee on the job" feature) was keyed only by
`recordingFeeFor`, not cleared when it changed — opening a second
submission's fee form while a first one was mid-entry, unsaved, carried
the first submission's values into the second. Fixed by resetting
`feeForm` in the same click handler that opens it. (b) Navigating from
one job straight to another (via a link, not a full reload) left
`selectedCandidateId`, `editing`, `recordingFeeFor` and `feeForm` from
the previous job sitting in state — a stale candidate selection could
have been added to the wrong job. Fixed by resetting all four in the
effect keyed on the `id` route param, alongside the existing reload.

**5. `CampaignDetail.tsx` showed a "suppressed" recipient count with no
indication of why** — a real usability gap, found independently of the
above while checking the marketing UI against the mock campaign.
`campaign_recipients.suppression_reason` was captured at claim time
(Milestone 4) but never surfaced. Added `fetchSuppressionBreakdown()` in
`src/lib/campaigns.ts` (a direct, RLS-permitted read grouped by reason
client-side) and a "Why recipients were suppressed" breakdown under the
recipient counts.

Verification: extended `supabase/tests/security_fixes.sql` as described
above (8/8 passing); `npm run validate` (typecheck, lint, unit tests,
build) clean. The AI-chat and job-detail fixes are Netlify-function and
authenticated-route code respectively — neither is reachable from this
session's own browser tools without your login, so those two are
verified by code review and the type/build checks rather than a live
click-through; worth you giving the assistant and a job's fee-recording
flow a try next time you're in the app.

## Send-a-contract, send-an-invoice (2026-09-03)

Two related document flows, requested directly by the user: a way to send
a recruitment contract to a firm for signature, and a way to send an
invoice for a placement's fee. Both share the same shape — a template
rendered into an immutable snapshot at send time (so editing the template
later never rewrites a document already sent), a signed-token public link
(same HMAC pattern as the Milestone 5 unsubscribe link, under its own
`DOCUMENT_TOKEN_SECRET` rather than reusing `UNSUBSCRIBE_TOKEN_SECRET` —
different blast radius if either ever leaked), and a public, no-login page
server-rendered directly by the Netlify function (`sign-contract.ts`,
`view-invoice.ts`), the same "no SPA route" approach as `unsubscribe.ts`.

**Two decisions made directly by the user, asked up front rather than
assumed**: contract signing is a deliberately lightweight, self-built
e-signature — a typed full name, timestamp and IP captured against a
uniquely-tokened link — over integrating a real e-signature provider
(DocuSign etc.), to avoid a new paid third-party dependency; and invoices
are delivered as an emailed link to a viewable page, over generating and
attaching an actual PDF.

- **Contracts**: `contract_templates` (one seeded "Standard recruitment
  terms" template with `{{firm_name}}`/`{{fee_percent}}`/
  `{{guarantee_days}}`/`{{today}}` merge fields — no template-editor page
  yet, editing the wording for now means updating the row directly) and
  `firm_contracts` (`draft` → `sent` → `signed`/`void`). Sending a
  contract (`create_contract` then, once the email actually goes out,
  `mark_contract_sent`) advances a `prospect`/`contacted` firm to
  `terms_sent`; a real signature (`record_contract_signature`, reached
  only through `sign-contract.ts` under the service role, idempotent —
  a doubled submit doesn't overwrite the recorded signature) advances it
  to `terms_signed` — the relationship-stage lifecycle Milestone 22
  defined but never had anything actually driving it. `FirmContracts.tsx`
  on the firm detail page shows the history and lets staff send a new one
  or void an unsigned one.
- **Invoices**: `invoices`, one per placement, referencing the fee
  already recorded on it (`create_invoice` refuses a placement with no
  fee recorded — an invoice full of blanks helps no one) and computing
  GST/total. Sending one (`create_invoice` then `mark_invoice_sent`)
  flips `placements.invoice_status` from `not_invoiced` to `invoiced` the
  first time, but never overrides a status staff already progressed
  further — that dropdown stays the source of truth afterward. The
  view-invoice page marks `viewed_at` the first time it's opened
  (`record_invoice_viewed`, idempotent). Wired into `JobDetail.tsx`
  right where the fee is recorded, matching the placement's earlier
  "record fee on the job, not a separate page" decision.

**A second confirmed instance of the Supabase-default-privileges gap**
(first found during the full review above): testing
`record_contract_signature` and `record_invoice_viewed` — both meant to
be reachable only via their respective Netlify function under the
service role, with no `GRANT EXECUTE` written anywhere in the migration —
showed them directly callable by an ordinary authenticated client anyway.
Same root cause as before: Supabase grants EXECUTE on every new function
to `anon`/`authenticated` automatically, so "never granted" isn't actually
true until `PUBLIC`/`anon`/`authenticated` are explicitly revoked. Fixed
in the same migration, and both are now covered by
`supabase/tests/contracts_and_invoices.sql`'s 10 assertions (role checks,
merge-field rendering, the relationship-stage and invoice-status side
effects, both idempotent service-role functions, and the direct-call
rejection checked specifically against Postgres's `insufficient_privilege`
error). Worth remembering for any future SECURITY DEFINER function meant
to be internal-only: write the explicit revoke, don't rely on simply
never writing a grant.

`DOCUMENT_TOKEN_SECRET` is now set in Netlify (added by the user directly
in the dashboard, since this session has no Netlify access token to set
it programmatically the way the other secrets were configured) and
confirmed live: `/api/sign-contract`/`/api/view-invoice` with a bogus
token both correctly return the styled "link not valid" page instead of
the `getDocumentTokenSecret()` crash they threw before the variable
existed.

**A real bug found live, the first time "Send contract" was actually
clicked in the deployed app**: it failed with "not authorised" for a real
admin session. Root cause: `send-contract.ts`/`send-invoice.ts` verify
the caller's session and role themselves (same pattern as
`send-direct-email.ts`) and then call `create_contract`/
`mark_contract_sent`/`create_invoice`/`mark_invoice_sent` through the
**service-role** client — deliberately, since the same request also has
to write `email_messages`/`activities` rows, both insert-restricted to no
client role at all. But those four functions, as first written, *also*
carried their own `current_app_role() is null or ...` check — which
reads `auth.uid()` from a request JWT, and a service-role call has no JWT
at all, so `current_app_role()` is always `NULL` for it and the check
always raised "not authorised". `void_contract` (called directly from
the browser with the user's own session, not through the service role)
never hit this and worked correctly throughout. Fixed in
`supabase/migrations/20260902000033_fix_service_role_only_rpcs.sql`: the
four functions drop the internal check entirely — the calling Netlify
function is now the only gate, exactly like `send-direct-email.ts`'s own
writes — and are locked down to service-role only in exchange, the same
"explicit revoke, don't rely on never granting" fix as everywhere else.
That migration also caught `void_contract` still carrying the same
leftover `anon` grant every function in this project has had by default
(harmless here, since its own check already rejects an unauthenticated
caller, but revoked anyway on principle).

Both sends still go through the fake email provider from Milestone 4 (no
real provider account exists yet), so a "sent" contract or invoice logs
what it would have sent to the console rather than actually emailing
anyone — same caveat as every other send in this project until a real
provider is connected.

Verification: `supabase/tests/contracts_and_invoices.sql`, rewritten
after the service-role fix to match the corrected security model (an
authenticated admin session now correctly gets rejected from the four
service-role-only functions, not just an unrecognised caller) — 11/11
passing; `npm run validate` clean; every PostgREST embed used in the new
client code (`contracts.ts`, `invoices.ts`, and the two public Netlify
functions' joins) individually confirmed against the live schema via a
direct REST call — each returns `200` with the right shape rather than a
relationship-resolution error, since RLS alone can't be used to tell a
working query from a broken one when the caller has no rows to see
either way. The actual click-through — sending a real contract and
watching the firm's relationship stage advance — needs your own login,
so that part is confirmed by you retrying it, not by this session
directly.

**Follow-up, same day**: since the fake email provider (no real one
connected yet) means a "sent" contract or invoice never actually reaches
an inbox, there was no way to see what the recipient would get without
digging through Netlify function logs. `send-contract.ts`/
`send-invoice.ts` now also return the signed link in their JSON response
(`signLink`/`viewLink`), and `FirmContracts.tsx`/`JobDetail.tsx` show it
directly in the UI right after sending, with a note explaining why it's
there instead of in an email. Purely a staff-facing convenience — the
link itself is nothing a recipient wouldn't already be emailed, so
showing it to the person who just sent it has no privacy implication.

**Further follow-ups, same day**: three more requests against this
feature, in order.

1. A "Preview" action next to every contract/invoice in
   `FirmContracts.tsx`/`JobDetail.tsx`, not just the one just sent — the
   original link only ever showed up once, in a dismissible banner, with
   nothing to fall back on if you dismissed it or left the page. New
   `document-link.ts` mints a fresh signed token for any already-created
   contract or invoice (any status — sign-contract.ts/view-invoice.ts
   already render the right thing for whichever status it's in), so
   staff can go back and pull the link up again on demand.
2. Branding: the signing/invoice pages looked like a bare utility page
   even though it's the one place a firm contact who's never seen the
   CRM forms an impression of it. Both now render as actual Yateworth
   letterhead — the same wordmark, font pairing and oxblood/ink/brass
   palette as the app (ported from `src/index.css`) — with the document
   date up top, and a "Download PDF" button on each (`window.print()`
   plus print CSS hiding everything but the document — no PDF library
   needed, every browser's print dialog already saves to PDF).
3. A real drawn signature, not just a typed name: the signing page now
   has an actual `<canvas>` signature pad (Pointer Events, so mouse,
   touch and pen all work with one set of listeners) that has to be
   drawn on before the form will submit, captured as a PNG data URL and
   stored in a new `firm_contracts.signature_image` column
   (`supabase/migrations/20260902000034_contract_drawn_signature.sql`).
   The typed full name stays too, for the textual/legal record. Neither
   is a certified e-signature (see the note at the top of migration 32
   — that trade-off was made deliberately, not accidentally), just a
   more convincing lightweight one. Worth knowing for that migration:
   `create or replace function` matches on the exact parameter type
   list, and this added a 5th parameter to `record_contract_signature`
   — without an explicit `drop function` first, the old 4-argument
   version would have stuck around as a second overload instead of
   actually being replaced, so the migration drops it explicitly before
   recreating it.

Verification: extended `supabase/tests/contracts_and_invoices.sql`
confirms only one `record_contract_signature` overload exists after the
migration and that `signature_image` round-trips correctly (11/11
still passing); `npm run validate` clean; the branded letterhead itself
(both the unsigned sign-form view and an already-signed view) was
checked visually in the browser pane against a real contract in the
database in the previous round of changes. This round's canvas signing
pad was verified functionally rather than visually — the browser pane's
screenshot tool was unreliable this session (intermittently returning a
blank capture even once the tab was confirmed frontmost) — by
dispatching synthetic `PointerEvent`s at the actual canvas element and
reading back its pixel data: a stroke drawn across known coordinates
left ink at those exact pixels, an untouched corner stayed pure white,
and clicking "Clear" reset a previously-inked pixel back to white.

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
- **Recording a placement's fee moved onto the job itself** - direct
  feedback ("it should be on the job") after the "Record fee →" link
  sent you off to the separate Placements page. New
  `fetchPlacementsForJob()` and `JobDetail`'s pipeline board now shows,
  inline on each placed candidate's card: the recorded fee and an
  invoice-status pill if a placement exists, or a small inline form
  (start date, salary, fee, guarantee end) to record one right there if
  it doesn't - no navigation away from the job. The Placements page
  itself is unchanged and still useful as the cross-job fee ledger; this
  just adds the per-job path alongside it.
- **Jobs pipeline "won" fixed to read from status, not a separate
  placement record** (migration 30) - direct bug report: marking a job
  'filled' didn't show it as won on the dashboard until a placement was
  *also* recorded separately, which read as broken rather than as the
  deliberate two-signal design it was. Won is now simply `status =
  'filled'`, matching the meaning 'filled' already has everywhere else
  (StatusBadge's tone map already treated it as success). The fee amount
  still comes from a placement when one is recorded; a won job with none
  yet shows "Won · record fee →" linking straight to Placements instead
  of silently showing as not won.
- **Jobs can be edited after creation** - a real gap: Candidates and
  Firms both had full edit forms from Stage 1, but `JobDetail` only ever
  let you change status. New `updateJob()`/`jobToFormValues()`, and the
  create/edit field set is now a shared `JobForm` component (matching
  the `CandidateForm`/`FirmForm` pattern) used by both `/jobs` (create)
  and `/jobs/:id` (edit) instead of duplicating the fields inline.
  `JobDetail` also gained a proper read-only details view for every
  field a job has - practice area, location, employment type, PQE
  range, salary range, fee % and description were all being collected
  since Stage 3 but never actually shown or editable, only title and
  firm name were. Found `employmentType` had been sitting in
  `JobFormValues` unused the entire time; it's now a real form field.
- **Dashboard reworked around direct feedback**: "nothing is relevant"
  about the Overview section (report requests/opt-ins/suppressions/
  campaign+message status from `dashboard_summary()`) and the Surveys
  card, so both are gone from the dashboard entirely - `CountCard`
  deleted as fully dead code once that was its only caller;
  `fetchDashboardSummary()` itself stays in `reporting.ts` (still
  tested) since the underlying capability might still serve a dedicated
  marketing report later, it just isn't surfaced here any more. New
  "Recently added" section (candidates/firms/newsletter sign-ups) using
  new `recent_blog_signups()` (migration 29 - a narrow admin/recruiter
  read path onto `communication_preferences`, which stays admin-only
  SELECT at the table level, matching the pattern `insights_dashboard()`
  and `survey_aggregate_report()` already established) plus plain
  `fetchRecentCandidates()`/`fetchRecentFirms()` queries. Every item on
  the dashboard now links through to its record, including "My tasks"
  (previously plain text - now links to the task's subject when it has
  one).
- **UX pass: bigger buttons, colour-coded status everywhere, a clearer
  nav** - direct feedback that navigation wasn't easy and status was
  hard to scan. New `--color-success` theme token (the brand palette is
  oxblood + brass + sage - functional but had no clear "positive" tone
  distinct from ox, which already doubles as the app's danger/attention
  colour) and a shared `StatusBadge` component with per-domain tone maps
  (job status, candidate status, invoice status, firm relationship
  stage, submission stage) so the same status always reads the same
  colour everywhere it appears, not just in the one place it happened to
  be built first. Applied across Jobs/Candidates/Firms/Placements lists
  and detail pages, plus both kanban boards (candidate pipeline, job
  submissions), which now also get a colour-coded top border per column.
  Nav rebuilt as filled pills with a real active state instead of a thin
  underline, bigger touch targets throughout, primary buttons bumped
  from `px-3 py-1.5` to `px-4 py-2` with heavier weight app-wide. The
  jobs pipeline dashboard section (built last turn) got the heaviest
  treatment as the direct example given - tinted totals cards, a
  coloured left border per job row, won/not-won badges - everything else
  above follows the same StatusBadge pattern for consistency rather than
  one-off colours per screen.
- **Jobs pipeline on the dashboard** (migration 28) - open jobs with an
  estimated value (fee_percent against salary - the real fee isn't known
  until a placement exists), and closed jobs showing whether they were
  won and the actual fee, read from whether a placement actually exists
  rather than trusting job status alone (so the number always matches
  what's on the Placements page above). Totals strip: open count,
  estimated pipeline value, won/closed ratio, total fees won.
  admin/recruiter only, matching jobs/placements RLS exactly.
- **Email is optional on `create_candidate`/`create_firm_contact`**
  (migration 27) - both required an email from the start, on the
  assumption a recruiter always has it in hand. Direct feedback: a call
  often produces a name before an email, and neither the assistant nor
  the manual forms should force one to be invented or block adding the
  person. Existing reuse-by-email/dedup behaviour is unchanged when an
  email *is* given; this only makes the parameter optional, matching
  `email_addresses.person_id` already being nullable by design
  (migration 3) - a person can simply have zero email_addresses rows
  until one is added later.
- **Conversational assistant on the dashboard, backed by Claude**
  (admin/recruiter only) - superseded the original single-shot "Quick
  add" box per direct feedback ("more like a chat box... it asks more
  questions if it needs"). `netlify/functions/ai-chat.ts` gives Claude
  two kinds of tools: read tools (search_candidates,
  search_firms, get_attention_needed - wraps `insights_dashboard()`) it
  can call and loop on *within one request* to actually answer a
  question in prose, and write tools (create_candidate,
  create_firm_contact, log_activity) that only ever produce a proposal -
  never executed server-side. The client is deliberately stateless
  between turns: rather than round-tripping raw Anthropic
  tool_use/tool_result message objects (the technically "proper" way to
  do multi-turn tool use, but brittle across separate HTTP requests),
  each turn resends the whole conversation as plain text, with any prior
  proposal's confirm/skip outcome folded back in as a line of context.
  Simpler and more robust than the strict protocol, at the cost of not
  being quite how Claude's own multi-turn tool use is normally wired -
  worth knowing if this gets extended later. Firm/person names in a
  proposal are resolved against real records server-side, never guessed
  by the model. Every write is a card with Confirm/Skip in the
  conversation, never an immediate save; confirming executes through the
  exact same createCandidate/createFirmContact/logActivity paths the
  manual forms use. **Needs `ANTHROPIC_API_KEY` set as a Netlify
  environment variable** - same "only you can create this" step as the
  Google Cloud key Gmail sync needs, at console.anthropic.com. Disclosed
  scope: candidates, firm contacts and activity logs for writes - not
  job creation from text, since a job's required fields (PQE range,
  salary range) don't come through reliably in a spoken note.
  **Switched from Haiku to Sonnet 5** after live feedback that Haiku was
  missing details already present in the message and generally feeling
  unreliable - a deliberate reliability-over-speed tradeoff, worth
  revisiting if the extra latency turns out to matter more in practice
  than the accuracy gain. System prompt now explicitly requires using
  every field the message already gives rather than leaving it blank.
  A stuck-card bug was also fixed here: a create action missing an email
  used to just sit disabled with no way forward; combined with making
  email fully optional on the underlying functions (above), a missing
  email is no longer a blocker at all - an inline field lets one be
  added on the spot if wanted, but Confirm no longer requires it.
- **File storage on candidates, firms and jobs** (migration 26) - a
  private `attachments` Storage bucket plus a `file_attachments`
  metadata table (subject_type/subject_id polymorphic, matching the
  activities/tasks pattern), RLS mirroring people/firms/jobs exactly
  (recruiter/admin only). `candidate_profiles.cv_storage_path` has sat
  unused since the very first migration anticipating exactly this - it
  stays as-is for now (a candidate's actual CV upload goes through this
  same new attachments system rather than that single-file column, which
  would need its own separate wiring for one narrower case). Downloads
  go through a short-lived signed URL since the bucket is private, not a
  bare public link.
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
