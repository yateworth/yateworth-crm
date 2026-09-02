-- Phase 2, Stage 2 (docs/crm-functionality-plan.md): activities and
-- tasks. Both fully specified in the original build spec's section 6
-- schema, never migrated since Milestones 1-6 scoped to Phase 0/1.
--
-- activities is "immutable-ish" per the spec: insert and read only, no
-- update/delete grant for any client role - a timeline entry doesn't
-- get edited after the fact, matching the audit_log/consent_events
-- append-only pattern already established.

create type task_status as enum ('open', 'completed', 'cancelled');

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

create trigger tasks_set_updated_at before update on tasks
  for each row execute function set_updated_at();

alter table activities enable row level security;
alter table tasks enable row level security;

-- RLS's own NULL semantics already fail closed correctly here (a NULL
-- current_app_role() makes the USING clause false, so the row is
-- excluded) - the bug fixed in migration 15 was specific to PL/pgSQL's
-- IF treating a NULL condition as false inside a function body, not RLS
-- policies themselves.
create policy "activities_recruiter_admin_select" on activities for select
  to authenticated using (current_app_role() in ('admin', 'recruiter'));
create policy "activities_recruiter_admin_insert" on activities for insert
  to authenticated with check (current_app_role() in ('admin', 'recruiter'));

create policy "tasks_recruiter_admin_all" on tasks for all
  to authenticated using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));
