-- Phase 2, Stage 3 (docs/crm-functionality-plan.md): jobs and the
-- candidate pipeline. Both fully specified in the original build spec's
-- section 6 schema, never migrated until now.

create type job_status as enum ('draft', 'open', 'on_hold', 'filled', 'closed', 'cancelled');
create type submission_stage as enum ('longlist', 'shortlist', 'submitted', 'interview', 'offer', 'placed', 'rejected', 'withdrawn');

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

create trigger jobs_set_updated_at before update on jobs
  for each row execute function set_updated_at();
create trigger submissions_set_updated_at before update on submissions
  for each row execute function set_updated_at();

create trigger jobs_audit after insert or update or delete on jobs
  for each row execute function audit_row_change();
create trigger submissions_audit after insert or update or delete on submissions
  for each row execute function audit_row_change();

alter table jobs enable row level security;
alter table submissions enable row level security;

-- Jobs: recruiter/admin manage, viewer read-only - same pattern as firms.
create policy "jobs_recruiter_admin_all" on jobs for all
  to authenticated using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));
create policy "jobs_viewer_select" on jobs for select
  to authenticated using (current_app_role() = 'viewer');

-- Submissions link a candidate to a job - same access as candidate_profiles
-- itself (recruiter/admin only, no viewer), since a submission's stage and
-- notes are as sensitive as the candidate record it references.
create policy "submissions_recruiter_admin_all" on submissions for all
  to authenticated using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));
