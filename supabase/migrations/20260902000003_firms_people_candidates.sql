-- Phase 0: the minimal recruitment tables needed to seed fictional data
-- and exercise RLS end to end. Jobs, submissions, interviews, offers and
-- placements are deferred to the Phase 2 migrations per the build spec's
-- phase breakdown.

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

create trigger firms_set_updated_at before update on firms
  for each row execute function set_updated_at();
create trigger people_set_updated_at before update on people
  for each row execute function set_updated_at();
create trigger candidate_profiles_set_updated_at before update on candidate_profiles
  for each row execute function set_updated_at();

create trigger firms_audit after insert or update or delete on firms
  for each row execute function audit_row_change();
create trigger people_audit after insert or update or delete on people
  for each row execute function audit_row_change();
create trigger candidate_profiles_audit after insert or update or delete on candidate_profiles
  for each row execute function audit_row_change();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table firms enable row level security;
alter table people enable row level security;
alter table email_addresses enable row level security;
alter table candidate_profiles enable row level security;

-- Firms: recruiter/admin manage; viewer gets read-only reporting access.
-- Marketing has no access to firm records (out of scope for their role).
create policy "firms_recruiter_admin_all"
  on firms for all
  to authenticated
  using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));

create policy "firms_viewer_select"
  on firms for select
  to authenticated
  using (current_app_role() = 'viewer');

-- People, email addresses and candidate profiles: recruiter/admin only.
-- Per spec section 7, marketing must not see identifiable candidate
-- notes, CVs or salaries, and no other role has a stated need for this
-- data, so the default here is deny rather than a partial read grant.
create policy "people_recruiter_admin_all"
  on people for all
  to authenticated
  using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));

create policy "email_addresses_recruiter_admin_all"
  on email_addresses for all
  to authenticated
  using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));

create policy "candidate_profiles_recruiter_admin_all"
  on candidate_profiles for all
  to authenticated
  using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));
