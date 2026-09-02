-- Phase 3 (partial): placement and fee tracking. interviews/offers are
-- also in the original spec's Phase 3 scope but weren't asked for here -
-- placements.offer_id from the spec's schema is dropped since there's no
-- offers table to reference yet; a small addition later if that's built.
--
-- One placement per submission (the terminal state of a successful
-- pipeline run) - RLS matches submissions exactly (recruiter/admin only,
-- no viewer), since fee amounts are as sensitive as anything else in the
-- candidate/pipeline data.

create type invoice_status as enum ('not_invoiced', 'invoiced', 'paid', 'written_off');

create table placements (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions(id) on delete restrict,
  start_date date,
  salary numeric(12,2),
  fee_amount numeric(12,2),
  invoice_status invoice_status not null default 'not_invoiced',
  guarantee_end_date date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger placements_set_updated_at before update on placements
  for each row execute function set_updated_at();
create trigger placements_audit after insert or update or delete on placements
  for each row execute function audit_row_change();

alter table placements enable row level security;

create policy "placements_recruiter_admin_all" on placements for all
  to authenticated using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));
