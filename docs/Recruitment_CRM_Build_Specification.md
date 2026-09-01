# Recruitment CRM — Build Specification

**Status:** Initial build brief  
**Deployment target:** Netlify + Supabase  
**External services:** Apollo and a transactional/broadcast email provider  
**Primary jurisdiction:** Australia  

## 1. Product outcome

Build a secure, privacy-conscious recruitment CRM and applicant tracking system for a boutique Australian legal recruitment business.

The system must support four distinct functions without mixing their data or permissions:

1. Anonymous Legal Work Conditions Survey.
2. Report requests and report delivery.
3. Blog/newsletter marketing.
4. Recruitment operations and recruitment-related communications.

Apollo prospects must not automatically become permanent CRM candidates. Apollo results are held in a separate prospect staging area and promoted into the CRM only when there is a legitimate reason to do so—for example, the person responds, asks for the report, subscribes, expresses interest in opportunities, applies, or is manually accepted by an authorised user.

## 2. Recommended architecture

| Layer | Recommended implementation | Responsibility |
|---|---|---|
| Web application | React + TypeScript + Vite, hosted on Netlify | Authenticated CRM and public forms |
| UI | Tailwind CSS + accessible component library | Dashboard, tables, forms and responsive layout |
| Authentication | Supabase Auth | Secure login, password reset, MFA-ready sessions |
| Database | Supabase Postgres | CRM, ATS, consent, campaign and reporting data |
| Access control | Supabase Row Level Security | Role-based data access enforced in the database |
| Server-side API | Netlify Functions in TypeScript | Provider integrations, imports, exports and webhook endpoints |
| Scheduled work | Netlify Scheduled Functions | Campaign queues, follow-ups, syncs and bounce reconciliation |
| Email | Provider adapter; start with Resend or Postmark | Delivery, provider events, bounces and complaints |
| Prospect data | Apollo API | Search/enrichment and optional outbound sequence sync |
| File storage | Supabase Storage | CVs, job briefs, report files and imports |
| Monitoring | Structured server logs + error monitoring | Integration failures, webhook errors and security events |

### Architectural rules

- The browser may use only the Supabase anonymous/public key. It must never receive a Supabase service-role key, Apollo key or email-provider key.
- Every privileged provider call must run in a server-side function.
- All webhooks must verify the provider signature where the provider supports signatures.
- All webhook and import operations must be idempotent.
- Suppression and permission checks must occur at send time, not merely when a mailing list is created.
- The application database is the source of truth for permissions and suppressions. Apollo and the email provider are downstream systems.
- Never log full CV contents, survey answers, access tokens or provider secrets.

## 3. Roles

| Role | Access |
|---|---|
| `admin` | Full configuration, users, exports, integrations and deletion |
| `recruiter` | Candidates, firms, jobs, submissions, activities and tasks |
| `marketing` | Survey reports, permissioned lists, templates and campaigns; no private candidate notes |
| `viewer` | Read-only operational reporting |

Create permissions explicitly. Do not use hidden UI elements as the only access control; enforce access with Row Level Security and server-side checks.

## 4. Core data model

### Identity and recruitment

- `profiles`: application users linked to Supabase Auth.
- `firms`: law firms and other hiring organisations.
- `people`: a canonical human record.
- `email_addresses`: one or more normalised email identities for a person. Permissions and suppression attach to the email identity, not merely the person.
- `candidate_profiles`: candidate-specific information attached to a person.
- `firm_contacts`: links a person to a firm and stores their role and decision-maker status.
- `jobs`: vacancies owned by a firm.
- `submissions`: a candidate submitted to a job.
- `interviews`, `offers`, `placements`: later ATS workflow.
- `activities`: immutable-ish timeline of calls, emails, notes, imports and status changes.
- `tasks`: follow-ups with an owner and due date.

### Permissions and email safety

- `communication_preferences`: current permission state for each email and purpose.
- `consent_events`: append-only evidence ledger recording every permission change.
- `suppression_entries`: central register of opt-outs, complaints, bounces and manual blocks.
- `mailing_lists` and `mailing_list_members`: reusable audience groupings; membership never overrides permission.
- `email_templates`, `campaigns`, `campaign_recipients`, `email_messages` and `email_events`: campaign execution and reporting.

### Survey anonymity

- `surveys`, `survey_questions`, `survey_options`, `survey_responses` and `survey_answers` contain no email, person or candidate foreign key.
- `report_requests` contains the email used for report delivery but has no response identifier.
- The public flow must submit the anonymous survey and report request as two independent requests.
- Do not store a raw IP address in survey responses. If abuse prevention is required, use a short-lived salted hash in a separate rate-limit store.
- Do not place a unique campaign contact ID into the saved response. A broad non-identifying campaign/source code is acceptable only if the privacy notice explains it.

### Apollo staging

- `apollo_prospects` is a staging pool and is not part of the permanent candidate CRM.
- `apollo_sync_runs` records imports and outbound synchronisation.
- `external_links` maps local records to Apollo/provider IDs.
- Promotion into `people` must be an explicit, auditable operation.

## 5. Permission model

Use three independent purposes:

| Purpose | Meaning | Default consequence |
|---|---|---|
| `report` | One requested report delivery | Single use; mark fulfilled after successful delivery |
| `blog` | Ongoing blog/newsletter messages | Express opt-in required |
| `recruitment` | Ongoing recruitment opportunities and offers | Store the precise basis and evidence; do not assume Apollo data is consent |

The survey form must use separate, unticked controls. Suggested wording:

- “Email me a copy of the Legal Work Conditions Report when it is released.”
- “Send me articles and updates from [Business Name].”
- “Contact me privately about suitable legal career opportunities.”

Submitting the survey itself is not consent to any of the three communications.

### Sending decision

Before every email, evaluate in this order:

1. Is the address valid and not hard-bounced?
2. Is an `all_email` suppression present? If yes, block.
3. Is an `all_marketing` or matching purpose suppression present? If yes, block.
4. Does the current preference permit this purpose and message type?
5. Has a one-use report permission already been fulfilled? If yes, block.
6. Does the campaign itself remain approved and within rate limits?

This check must be performed atomically when a message is claimed from the queue.

### Unsubscribe behaviour

- Every commercial campaign email contains a signed, expiring-resistant unsubscribe token and a plain-language unsubscribe link.
- The unsubscribe page must work without login and must not request extra personal data.
- One click immediately records a purpose-level opt-out, writes a `consent_event`, adds a suppression entry and cancels queued messages for that purpose.
- Offer “unsubscribe from all marketing” as a separate choice; this creates an `all_marketing` suppression.
- A complaint or permanent hard bounce creates an `all_email` suppression.
- A soft bounce records the event; suppress after a configurable threshold such as three soft bounces within 30 days.
- Synchronise the block to Apollo and the email provider where their APIs permit, but never wait for either provider before enforcing the local suppression.
- Keep suppression records even if the corresponding person/candidate is deleted. Store the minimum address data needed to avoid accidentally contacting the address again.

## 6. Initial Supabase schema

This schema is an implementation starting point. Claude Code should place it in timestamped Supabase migrations, not paste it into application startup code.

```sql
create extension if not exists pgcrypto;
create extension if not exists citext;

create type app_role as enum ('admin', 'recruiter', 'marketing', 'viewer');
create type record_status as enum ('active', 'archived');
create type permission_purpose as enum ('report', 'blog', 'recruitment');
create type preference_status as enum ('unknown', 'opted_in', 'opted_out', 'fulfilled');
create type permission_kind as enum ('single_use', 'ongoing');
create type suppression_scope as enum ('all_email', 'all_marketing', 'report', 'blog', 'recruitment');
create type suppression_reason as enum ('unsubscribe', 'complaint', 'hard_bounce', 'soft_bounce_limit', 'manual', 'legal_request');
create type job_status as enum ('draft', 'open', 'on_hold', 'filled', 'closed', 'cancelled');
create type submission_stage as enum ('longlist', 'shortlist', 'submitted', 'interview', 'offer', 'placed', 'rejected', 'withdrawn');
create type task_status as enum ('open', 'completed', 'cancelled');
create type campaign_status as enum ('draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled');
create type recipient_status as enum ('pending', 'suppressed', 'queued', 'sent', 'delivered', 'bounced', 'complained', 'unsubscribed', 'failed', 'cancelled');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  website text,
  main_phone text,
  address jsonb not null default '{}'::jsonb,
  practice_areas text[] not null default '{}',
  size_band text,
  status record_status not null default 'active',
  owner_id uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index firms_name_lower_idx on firms (lower(name));

create table people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  preferred_name text,
  phone text,
  linkedin_url text,
  location text,
  source_type text,
  source_detail text,
  status record_status not null default 'active',
  owner_id uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table email_addresses (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete set null,
  email citext not null unique,
  is_primary boolean not null default false,
  verification_status text not null default 'unknown',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (email::text = lower(trim(email::text)))
);
create unique index one_primary_email_per_person_idx
  on email_addresses(person_id) where is_primary and person_id is not null;

create table candidate_profiles (
  person_id uuid primary key references people(id) on delete cascade,
  current_title text,
  current_firm_id uuid references firms(id) on delete set null,
  years_pqe numeric(5,2),
  admission_jurisdictions text[] not null default '{}',
  practice_areas text[] not null default '{}',
  desired_locations text[] not null default '{}',
  work_preferences text[] not null default '{}',
  salary_current numeric(12,2),
  salary_expected numeric(12,2),
  availability_date date,
  candidate_status text not null default 'prospective',
  cv_storage_path text,
  privacy_notice_at timestamptz,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table firm_contacts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  job_title text,
  department text,
  is_hiring_contact boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(firm_id, person_id)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  title text not null,
  reference_code text unique,
  status job_status not null default 'draft',
  practice_area text,
  location text,
  employment_type text,
  min_pqe numeric(5,2),
  max_pqe numeric(5,2),
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  fee_percent numeric(5,2),
  description text,
  confidential_notes text,
  owner_id uuid references profiles(id),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  candidate_id uuid not null references candidate_profiles(person_id) on delete cascade,
  stage submission_stage not null default 'longlist',
  submitted_at timestamptz,
  consent_to_submit_at timestamptz,
  source text,
  rejection_reason text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, candidate_id)
);

create table interviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  round_number integer not null default 1,
  scheduled_at timestamptz not null,
  location_or_link text,
  status text not null default 'scheduled',
  feedback text,
  created_at timestamptz not null default now()
);

create table offers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  offered_at date,
  salary numeric(12,2),
  terms jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  responded_at date,
  created_at timestamptz not null default now()
);

create table placements (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions(id) on delete restrict,
  offer_id uuid references offers(id) on delete set null,
  start_date date,
  salary numeric(12,2),
  fee_amount numeric(12,2),
  invoice_status text not null default 'not_invoiced',
  guarantee_end_date date,
  created_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null,
  subject_type text not null,
  subject_id uuid not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index activities_subject_idx on activities(subject_type, subject_id, occurred_at desc);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  subject_type text,
  subject_id uuid,
  assigned_to uuid references profiles(id),
  due_at timestamptz,
  status task_status not null default 'open',
  completed_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_owner_due_idx on tasks(assigned_to, status, due_at);

create table communication_preferences (
  id uuid primary key default gen_random_uuid(),
  email_address_id uuid not null references email_addresses(id) on delete cascade,
  purpose permission_purpose not null,
  status preference_status not null default 'unknown',
  kind permission_kind not null default 'ongoing',
  lawful_basis text,
  source text,
  evidence jsonb not null default '{}'::jsonb,
  effective_at timestamptz not null default now(),
  expires_at timestamptz,
  fulfilled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(email_address_id, purpose)
);

create table consent_events (
  id uuid primary key default gen_random_uuid(),
  email_address_id uuid not null references email_addresses(id) on delete restrict,
  purpose permission_purpose,
  event_type text not null,
  previous_status preference_status,
  new_status preference_status,
  source text not null,
  evidence jsonb not null default '{}'::jsonb,
  actor_user_id uuid references profiles(id),
  occurred_at timestamptz not null default now()
);
create index consent_events_email_idx on consent_events(email_address_id, occurred_at desc);

create table suppression_entries (
  id uuid primary key default gen_random_uuid(),
  email_address_id uuid not null references email_addresses(id) on delete restrict,
  scope suppression_scope not null,
  reason suppression_reason not null,
  source text not null,
  provider_event_id text,
  notes text,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references profiles(id)
);
create unique index active_suppression_unique_idx
  on suppression_entries(email_address_id, scope) where active;

create table mailing_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  purpose permission_purpose not null,
  description text,
  dynamic_filter jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table mailing_list_members (
  list_id uuid not null references mailing_lists(id) on delete cascade,
  email_address_id uuid not null references email_addresses(id) on delete cascade,
  added_source text,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key(list_id, email_address_id)
);

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose permission_purpose not null,
  subject_template text not null,
  html_template text not null,
  text_template text not null,
  version integer not null default 1,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose permission_purpose not null,
  template_id uuid not null references email_templates(id),
  list_id uuid references mailing_lists(id),
  status campaign_status not null default 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  provider text,
  provider_campaign_id text,
  created_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  email_address_id uuid not null references email_addresses(id) on delete restrict,
  email_snapshot citext not null,
  merge_data jsonb not null default '{}'::jsonb,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  status recipient_status not null default 'pending',
  suppression_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, email_address_id)
);
create index campaign_recipients_queue_idx on campaign_recipients(campaign_id, status);

create table email_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_recipient_id uuid references campaign_recipients(id) on delete set null,
  email_address_id uuid not null references email_addresses(id) on delete restrict,
  purpose permission_purpose not null,
  provider text not null,
  provider_message_id text,
  subject_snapshot text not null,
  status recipient_status not null default 'queued',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index provider_message_unique_idx
  on email_messages(provider, provider_message_id) where provider_message_id is not null;

create table email_events (
  id uuid primary key default gen_random_uuid(),
  email_message_id uuid references email_messages(id) on delete set null,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create table surveys (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  version integer not null default 1,
  status text not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  question_key text not null,
  question_text text not null,
  question_type text not null,
  position integer not null,
  required boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  unique(survey_id, question_key),
  unique(survey_id, position)
);

create table survey_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references survey_questions(id) on delete cascade,
  option_value text not null,
  option_label text not null,
  position integer not null,
  unique(question_id, option_value)
);

create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete restrict,
  response_token_hash text not null unique,
  status text not null default 'complete',
  broad_source text,
  submitted_at timestamptz not null default now()
);

create table survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references survey_responses(id) on delete cascade,
  question_id uuid not null references survey_questions(id) on delete restrict,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  unique(response_id, question_id)
);

create table report_requests (
  id uuid primary key default gen_random_uuid(),
  email_address_id uuid not null references email_addresses(id) on delete restrict,
  report_code text not null,
  requested_at timestamptz not null default now(),
  delivered_at timestamptz,
  status text not null default 'requested',
  source text,
  unique(email_address_id, report_code)
);

create table apollo_prospects (
  id uuid primary key default gen_random_uuid(),
  apollo_person_id text,
  email citext,
  first_name text,
  last_name text,
  title text,
  organisation_name text,
  linkedin_url text,
  location text,
  email_status text,
  raw_payload jsonb not null default '{}'::jsonb,
  staging_status text not null default 'new',
  promoted_person_id uuid references people(id) on delete set null,
  imported_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(apollo_person_id)
);
create index apollo_prospects_email_idx on apollo_prospects(email);

create table apollo_sync_runs (
  id uuid primary key default gen_random_uuid(),
  direction text not null,
  operation text not null,
  status text not null default 'started',
  stats jsonb not null default '{}'::jsonb,
  error_summary text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  started_by uuid references profiles(id)
);

create table external_links (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  local_entity_type text not null,
  local_entity_id uuid not null,
  external_id text not null,
  last_synced_at timestamptz,
  sync_state jsonb not null default '{}'::jsonb,
  unique(provider, local_entity_type, local_entity_id),
  unique(provider, external_id)
);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text,
  payload jsonb not null,
  status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, provider_event_id)
);
```

### Required database functions and triggers

Claude Code must add these in separate migrations:

1. `set_updated_at()` trigger for all mutable tables.
2. `normalise_email(text)` that applies `lower(trim(value))` and rejects invalid/oversized input.
3. `can_send_email(email_address_id, purpose, message_kind)` returning an allow/deny decision and reason.
4. `claim_campaign_batch(campaign_id, batch_size)` using `FOR UPDATE SKIP LOCKED`; re-check permission and suppression inside the transaction.
5. `record_unsubscribe(token, scope)` as a security-definer RPC with a narrow search path and no exposure of recipient data.
6. `promote_apollo_prospect(prospect_id)` that deduplicates by normalised email, creates/links the person and writes an activity entry.
7. Append-only protection on `consent_events`; updates/deletes restricted to database administrators.
8. Audit trigger for sensitive changes to permissions, suppressions, candidates, submissions and exports.

## 7. Row Level Security

Enable RLS on every public-schema table. Default deny.

- Public anonymous users may read only an active survey definition through a restricted view/RPC.
- Public anonymous users may submit only through narrow server-side functions that validate the survey schema.
- `marketing` can access aggregate survey reporting and report requests but cannot access identifiable candidate notes, CVs, salaries or submission details.
- `recruiter` can access recruitment records and tasks but cannot change integration secrets or user roles.
- Only `admin` can export bulk personal information, lift suppressions, manage users or configure integrations.
- CV storage buckets must be private and use short-lived signed URLs.
- Survey reporting must enforce minimum cohort sizes before displaying cross-tabs; use a default threshold of at least five responses to reduce re-identification risk.

Do not allow direct client-side inserts into suppression, campaign message or webhook tables. Route them through constrained server functions.

## 8. Public forms

### Survey submission

1. Load the active survey via a public read-only endpoint.
2. Validate required fields client-side for usability and server-side for security.
3. Submit answers without email or CRM identifiers.
4. Receive only a generic success response.
5. Separately submit any report/blog/recruitment choices to the permission endpoint.
6. Do not join the two requests in the database.

### Report and permission endpoint

The endpoint accepts email plus three separate booleans. It must:

- normalise and upsert the email identity;
- record a single-use `report` permission and `report_request` only if selected;
- record ongoing `blog` and/or `recruitment` preferences only if separately selected;
- write one consent event per purpose with form version, wording version, timestamp and broad source;
- send confirmation only where legally and operationally appropriate;
- never alter an existing opt-out merely because an import or form resubmission contains a checked value without sufficient evidence.

## 9. Apollo integration

### Safe import workflow

1. An authorised user defines an Apollo search outside or inside the CRM.
2. A server function fetches results and stores them in `apollo_prospects`.
3. Before showing an outreach action, the CRM checks the local suppression register by normalised email.
4. The user reviews the prospect and the proposed communication basis.
5. If outreach is approved, store the source and evidence used for that decision.
6. If the prospect engages or is accepted into recruitment, promote them to `people` and `candidate_profiles`.

### Synchronisation rules

- Local suppression always wins.
- Never set Apollo API options that bypass a provider global bounce list.
- Use explicit Apollo contact IDs for updates. Do not rely blindly on Apollo dedupe because it can match on name plus company and overwrite fields.
- Store Apollo IDs in `external_links`.
- Label exported contacts with a stable local purpose label, but do not use an Apollo label as proof of consent.
- Run a scheduled reconciliation and show failures on the admin dashboard.
- Do not automatically push every Apollo result into Supabase `people`.

### Apollo sequence option

The first build may use Apollo sequences for cold or one-to-one outreach while the CRM owns permission/suppression. Before adding a contact to a sequence:

1. Call the local send-eligibility check.
2. Create or update the Apollo contact using its known ID where possible.
3. Add it to the selected Apollo sequence.
4. Record the sequence/contact IDs and timestamp.
5. Pull or receive delivery/reply status.
6. Immediately stop/suppress on unsubscribe, complaint or permanent bounce.

## 10. Email campaigns

### Campaign creation

1. Select exactly one purpose.
2. Select a template and list/filter.
3. Generate a frozen recipient snapshot.
4. Run an eligibility preview showing allowed, opted out, suppressed, invalid and unknown counts.
5. Require an authorised approval before scheduling.
6. At send time, re-check every recipient.
7. Send in controlled batches with retry limits.

### Events

Process at least: queued, sent, delivered, soft bounce, hard bounce, complaint, unsubscribe, reply, open and click. Treat opens as approximate because privacy features can distort them. Never use opens as the sole proof that a person read or consented to a message.

### Provider adapter

Create an interface such as:

```ts
interface EmailProvider {
  send(message: OutboundMessage): Promise<ProviderSendResult>;
  verifyWebhook(request: Request): Promise<VerifiedProviderEvent[]>;
  suppress(email: string, reason: string): Promise<void>;
}
```

Keep provider-specific payloads out of the domain layer so the provider can be changed later.

## 11. CSV import/export

### Import

- Upload to a temporary private bucket.
- Parse on the server with a size and row limit.
- Show column mapping and a dry-run preview.
- Normalise emails and phones.
- Classify rows as create, update, duplicate, suppressed, invalid or conflict.
- Require confirmation before committing.
- Never reactivate an opt-out from CSV.
- Record file hash, uploader, counts and results in an import audit record.
- Delete temporary source files after the configured retention period.

### Export

- Admin-only for bulk personal data.
- Require a purpose/reason field.
- Log who exported, filters, row count and time.
- Exclude survey response identifiers from any report-request export.
- Apply spreadsheet formula-injection protection to values beginning with `=`, `+`, `-` or `@`.

## 12. Dashboard

The first dashboard should show:

- report requests and delivery status;
- blog and recruitment opt-ins;
- total active suppressions by reason;
- campaign deliveries, bounces, complaints and unsubscribes;
- survey starts/completions if starts are measured without identity;
- survey response totals and safe aggregate charts;
- Apollo staging counts and failed syncs;
- open jobs by stage;
- submissions by stage;
- overdue and due-today tasks;
- placements and fees when phase 3 is enabled.

## 13. Build phases

### Phase 0 — Foundation

- Initialise TypeScript app, Supabase local development and migration tooling.
- Add Auth, profiles, roles, RLS and audit logging.
- Add environment-variable validation.
- Add automated tests and CI checks.
- Seed fictional firms, candidates and emails only.

### Phase 1 — Survey and mailing system

- Anonymous survey builder/renderer and response storage.
- Separate report, blog and recruitment permission capture.
- Consent evidence ledger and suppression register.
- Report delivery queue.
- Templates, lists, campaigns and provider adapter.
- Signed unsubscribe flow.
- Bounce/complaint webhook processing.
- Apollo staging and basic synchronisation.
- Survey and campaign reporting.
- CSV import/export with dry-run.

**Phase 1 definition of done:** A test respondent can anonymously complete the survey, independently request the report and choose either ongoing permission. A campaign cannot be sent to an opted-out, complained or hard-bounced address, including after a CSV or Apollo re-import.

### Phase 2 — Recruitment CRM

- Candidate, firm and contact records.
- Search, filters, tags, notes, activities and files.
- Jobs, candidate matching/longlists and follow-up tasks.
- Apollo prospect promotion.
- Duplicate detection and merge workflow.

### Phase 3 — Full ATS

- Submissions, interview rounds and feedback.
- Offers, placements, fee and guarantee tracking.
- Job pipeline boards and recruiter reporting.
- Placement documents and invoice hand-off.

## 14. Security requirements

- Require secure Supabase Auth sessions; prepare for MFA and enforce it for admins before production.
- Use least-privilege RLS and service-role access only inside server functions.
- Apply CSRF protection where cookies are used, strict CORS, CSP and security headers.
- Rate-limit login, survey, permission, unsubscribe and webhook endpoints.
- Verify file type and size; virus-scan CV uploads before production use.
- Encrypt transport with HTTPS and rely on managed encryption at rest; consider field-level encryption for especially sensitive notes.
- Keep secrets only in provider environment settings and rotate them after accidental exposure.
- Use separate development and production projects/keys.
- Back up the production database and test restores.
- Create retention and deletion workflows, including candidate access/correction requests.
- Preserve minimal suppression data after deletion so an erased record is not silently re-contacted.
- Add monitoring for repeated failed logins, bulk exports, suppression lifting and unusually large campaign sends.

## 15. Environment variables

Create `.env.example` with names only:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APOLLO_API_KEY=
EMAIL_PROVIDER=
EMAIL_PROVIDER_API_KEY=
EMAIL_WEBHOOK_SECRET=
APP_BASE_URL=
UNSUBSCRIBE_TOKEN_SECRET=
CRON_SECRET=
SENTRY_DSN=
```

Never put real values in `.env.example`, Git, browser bundles, logs or test snapshots.

## 16. Instructions to give Claude Code

Use the following as the controlling implementation prompt:

> Build the Recruitment CRM described in `Recruitment_CRM_Build_Specification.md` in phases. Begin with Phase 0 and Phase 1 only. Use React, TypeScript, Vite, Tailwind, Supabase Postgres/Auth/Storage and Netlify Functions. Create timestamped SQL migrations, seed only fictional data and enforce Row Level Security on every public table. Treat the local database as the source of truth for consent and suppression. Apollo prospects must remain in `apollo_prospects` until explicitly promoted. Survey answers must never contain or link to an email, person, candidate, report request or unique campaign-recipient ID. Report, blog and recruitment permissions must be independent and unticked by default. Every send must atomically re-check permissions and suppressions. Provider webhooks must be signature-verified and idempotent. Never expose service-role, Apollo or email-provider credentials to the browser. Implement unit, database and end-to-end tests for all critical privacy rules. Stop after each numbered milestone, run the full validation suite, summarise changed files and unresolved risks, and wait for approval before the next milestone.

Then issue these milestone instructions one at a time:

1. “Implement project foundation, local Supabase, authentication, profiles, roles, RLS, environment validation and fictional seed data.”
2. “Implement the permission ledger, suppression register and tested `can_send_email` decision function.”
3. “Implement the anonymous survey with a separate permission/report request endpoint and prove with tests that the records cannot be joined.”
4. “Implement templates, mailing lists, campaign previews, recipient snapshots and atomic batch claiming. Use a fake email provider first.”
5. “Implement unsubscribe, bounce and complaint processing with idempotent webhook tests.”
6. “Implement report delivery and safe aggregate survey/campaign reporting.”
7. “Implement Apollo staging, suppression checking, explicit promotion and sync reconciliation using a fake Apollo adapter first.”
8. “Implement CSV dry-run import, conflict handling, safe export and audit records.”
9. “Run security/RLS tests, accessibility checks, dependency audit and end-to-end Phase 1 acceptance tests. Do not connect live credentials.”

## 17. Required tests

At minimum, automate these cases:

- Survey answers cannot be queried through report requests or email addresses.
- Report-only selection does not enable blog or recruitment campaigns.
- Blog opt-out does not silently change report/recruitment preference.
- “Unsubscribe all marketing” blocks blog and recruitment.
- Hard bounce and complaint block every email purpose.
- CSV import cannot remove an active suppression.
- Apollo re-import cannot remove an active suppression.
- A recipient who opts out after campaign preview but before send is not sent the email.
- Duplicate webhook delivery has no duplicate effect.
- An expired/tampered unsubscribe token does not expose an email address.
- Marketing users cannot read candidate CVs, salary or confidential notes.
- Recruiters cannot manage users, integration secrets or bulk exports.
- Anonymous users cannot enumerate survey responses or report requests.
- Spreadsheet formula-like CSV values are neutralised on export.
- Two campaign workers cannot claim the same recipient.

## 18. Production readiness checklist

- Business legal name, ABN and contact details configured in every commercial template.
- Privacy notice and collection notices reviewed by an Australian privacy lawyer.
- Outreach/consent approach reviewed for the Spam Act before importing or contacting Apollo prospects.
- Unsubscribe operates without login and is actioned immediately in the CRM.
- SPF, DKIM and DMARC configured for the sending domain.
- Production secrets added only after local acceptance tests pass.
- Webhook signatures tested with real provider sandbox/test events.
- RLS test suite passes against a clean database.
- Database backup and restore tested.
- Data retention, correction, access and deletion procedures documented.
- Staff permissions and MFA reviewed.
- A low-volume internal campaign succeeds before any external campaign.

## 19. Important compliance design notes

This system can enforce the business's recorded decisions; it cannot make an otherwise unlawful contact lawful. Apollo data, a work email address or a person's profession is not automatically consent to marketing. Australian spam rules generally require consent for commercial electronic messages, sender identification and a functional unsubscribe mechanism. The sender remains responsible even where a third-party platform sends the message.

Store consent evidence because the sender may need to prove it. Honour electronic unsubscribe requests within the statutory period; the system should apply them immediately. Keep the unsubscribe mechanism functional for at least 30 days after the message and do not require login, payment or additional personal information.

Under Australian privacy guidance, people may also request the source of personal information used for direct marketing. Retaining `source_type`, `source_detail`, Apollo identifiers and consent evidence supports this obligation.

Obtain Australian legal advice before production outreach, particularly for cold recruitment messages sourced through Apollo and for any use of inferred consent.

## 20. Authoritative references

- ACMA, “Avoid sending spam”: https://www.acma.gov.au/avoid-sending-spam
- OAIC, “Australian Privacy Principles guidelines — Chapter 7: Direct marketing”: https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-7-app-7-direct-marketing
- Federal Register of Legislation, Spam Act 2003: https://www.legislation.gov.au/C2004A01214/latest/text
- Apollo API, “Create a Contact”: https://docs.apollo.io/reference/create-a-contact
- Apollo API, “Add Contacts to a Sequence”: https://docs.apollo.io/reference/add-contacts-to-sequence

