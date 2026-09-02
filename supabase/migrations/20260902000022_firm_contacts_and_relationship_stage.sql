-- Two gaps raised directly by the user: (1) firms have no contacts - no
-- way to record the actual people (HR manager, hiring partner) at a
-- client firm; (2) firms have no relationship stage of their own -
-- jobs/submissions already track per-role pipeline, but the agency's
-- standing commercial relationship with a firm (one general terms-of-
-- business agreement, briefed for many jobs under it) had nothing to
-- track it separately.

-- ---------------------------------------------------------------------
-- firm_contacts: reuses `people` rather than a parallel contact record,
-- so a firm contact automatically gets the same activities/tasks every
-- other person gets, and - since email_addresses is the same table the
-- mailing-list segments read from - is automatically eligible for
-- mailouts too, with no separate system. A person is not necessarily a
-- candidate: candidate_profiles stays a separate opt-in extension, so a
-- firm contact with no candidate_profiles row is just a contact.
-- ---------------------------------------------------------------------
create table firm_contacts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  role_title text,
  is_primary boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, person_id)
);
create unique index one_primary_contact_per_firm_idx
  on firm_contacts(firm_id) where is_primary;

create trigger firm_contacts_set_updated_at before update on firm_contacts
  for each row execute function set_updated_at();

alter table firm_contacts enable row level security;

-- Matches firms' own RLS shape exactly (migration 3): recruiter/admin
-- manage, viewer gets read-only, marketing has no access.
create policy "firm_contacts_recruiter_admin_all"
  on firm_contacts for all
  to authenticated
  using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));

create policy "firm_contacts_viewer_select"
  on firm_contacts for select
  to authenticated
  using (current_app_role() = 'viewer');

-- ---------------------------------------------------------------------
-- create_firm_contact: atomic create across people/email_addresses/
-- firm_contacts, mirroring create_candidate's exact shape (migration 16)
-- including its email-reuse behaviour - the same person may already
-- exist in email_addresses (or even as a candidate) before becoming a
-- firm contact, and this must not create a duplicate person for them.
-- ---------------------------------------------------------------------
create function create_firm_contact(
  p_firm_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text default null,
  p_role_title text default null,
  p_is_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email citext;
  v_email_row email_addresses%rowtype;
  v_email_existed boolean;
  v_person_id uuid;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'recruiter') then
    raise exception 'not authorised';
  end if;

  if not exists (select 1 from firms where id = p_firm_id) then
    raise exception 'firm not found: %', p_firm_id using errcode = 'P0001';
  end if;

  v_email := normalise_email(p_email);
  select * into v_email_row from email_addresses where email = v_email;
  v_email_existed := found;

  if v_email_existed and v_email_row.person_id is not null then
    v_person_id := v_email_row.person_id;
  else
    insert into people (first_name, last_name, phone, source_type, created_by)
    values (p_first_name, p_last_name, p_phone, 'manual', auth.uid())
    returning id into v_person_id;

    if v_email_existed then
      update email_addresses set person_id = v_person_id where id = v_email_row.id;
    else
      insert into email_addresses (person_id, email, is_primary) values (v_person_id, v_email, true);
    end if;
  end if;

  insert into firm_contacts (firm_id, person_id, role_title, is_primary, created_by)
  values (p_firm_id, v_person_id, p_role_title, p_is_primary, auth.uid())
  on conflict (firm_id, person_id) do update set
    role_title = excluded.role_title,
    is_primary = excluded.is_primary;

  return v_person_id;
end;
$$;

grant execute on function create_firm_contact(uuid, text, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Firm relationship stage: the agency's standing commercial relationship
-- with the firm - one agreement, briefed for many jobs under it - kept
-- deliberately separate from job_status/submission_stage, which track
-- per-role pipeline and already exist. A plain enum column (like
-- job_status) rather than free text (like candidate_status) since
-- getting this wrong via typo has real business-development cost.
-- ---------------------------------------------------------------------
create type firm_relationship_stage as enum (
  'prospect', 'contacted', 'terms_sent', 'terms_signed', 'dormant'
);

alter table firms add column relationship_stage firm_relationship_stage not null default 'prospect';

-- Backfill: a firm with an existing job clearly already has terms in
-- place (you can't brief a role without an agreement), so it is not
-- still a cold prospect - every other existing firm defaults to
-- 'prospect' since there's no signal either way for them yet.
update firms set relationship_stage = 'terms_signed'
where id in (select distinct firm_id from jobs);
