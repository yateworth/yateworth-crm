-- Phase 1, Milestone 2: the permission ledger and suppression register that
-- every future send (report delivery, survey follow-up, campaigns) must
-- check before contacting anyone. No public-facing write path yet — that
-- lands in Milestone 3 (survey/report endpoint) and Milestone 5 (unsubscribe
-- and bounce/complaint webhooks). This migration only needs to prove the
-- ledger and the eligibility check are correct.

create type permission_purpose as enum ('report', 'blog', 'recruitment');
create type preference_status as enum ('unknown', 'opted_in', 'opted_out', 'fulfilled');
create type permission_kind as enum ('single_use', 'ongoing');
create type suppression_scope as enum ('all_email', 'all_marketing', 'report', 'blog', 'recruitment');
create type suppression_reason as enum ('unsubscribe', 'complaint', 'hard_bounce', 'soft_bounce_limit', 'manual', 'legal_request');

-- ---------------------------------------------------------------------
-- normalise_email: shared everywhere an address is accepted from a form,
-- an import row or a provider webhook.
-- ---------------------------------------------------------------------
create function normalise_email(p_email text)
returns citext
language plpgsql
immutable
as $$
begin
  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'email must not be empty';
  end if;
  if length(p_email) > 320 then
    raise exception 'email exceeds maximum length';
  end if;
  if position('@' in p_email) <= 1 or position('@' in p_email) = length(p_email) then
    raise exception 'email is not valid: %', p_email;
  end if;
  return lower(trim(p_email))::citext;
end;
$$;

-- ---------------------------------------------------------------------
-- communication_preferences: current state, one row per email+purpose
-- ---------------------------------------------------------------------
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

create trigger communication_preferences_set_updated_at
  before update on communication_preferences
  for each row execute function set_updated_at();
create trigger communication_preferences_audit
  after insert or update or delete on communication_preferences
  for each row execute function audit_row_change();

alter table communication_preferences enable row level security;

create policy "communication_preferences_admin_select"
  on communication_preferences for select
  to authenticated
  using (current_app_role() = 'admin');

-- No insert/update/delete policy for any client role: the only public
-- write path is the Milestone 3 permission endpoint and the Milestone 5
-- record_unsubscribe RPC, both SECURITY DEFINER.

-- ---------------------------------------------------------------------
-- consent_events: append-only evidence ledger
-- ---------------------------------------------------------------------
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

alter table consent_events enable row level security;

create policy "consent_events_admin_select"
  on consent_events for select
  to authenticated
  using (current_app_role() = 'admin');

-- Append-only: no client role, including admin, may update or delete a
-- consent event once written.
revoke update, delete on consent_events from authenticated, anon;

-- ---------------------------------------------------------------------
-- suppression_entries: central opt-out / complaint / bounce / block register
-- ---------------------------------------------------------------------
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

alter table suppression_entries enable row level security;

create policy "suppression_entries_admin_select"
  on suppression_entries for select
  to authenticated
  using (current_app_role() = 'admin');

-- Admins may lift a suppression (the only field-level change this table
-- allows from the client) but may not create one directly — new
-- suppressions are written only by admin_add_suppression below and, in
-- later milestones, the unsubscribe RPC and bounce/complaint webhooks.
create policy "suppression_entries_admin_lift"
  on suppression_entries for update
  to authenticated
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

-- ---------------------------------------------------------------------
-- can_send_email: the eligibility check every send must run.
-- Implements the spec's sending-decision order (steps 1-5; step 6,
-- campaign approval/rate limits, is added when campaigns exist in
-- Milestone 4). Callable by any authenticated staff role so recruiter/
-- marketing UIs can preview eligibility without reading the ledger
-- tables directly.
--
-- NOTE: per the spec's literal decision order, an active
-- 'all_marketing' suppression blocks EVERY purpose including 'report',
-- not just 'blog'/'recruitment'. That reads slightly counterintuitive
-- for a one-off requested report and is worth confirming is actually
-- the intended behaviour before Milestone 3 builds the report endpoint
-- on top of it.
-- ---------------------------------------------------------------------
create function can_send_email(
  p_email_address_id uuid,
  p_purpose permission_purpose
)
returns table(allowed boolean, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pref communication_preferences%rowtype;
begin
  if not exists (select 1 from email_addresses where id = p_email_address_id) then
    return query select false, 'unknown_email';
    return;
  end if;

  if exists (
    select 1 from suppression_entries
    where email_address_id = p_email_address_id and scope = 'all_email' and active
  ) then
    return query select false, 'all_email_suppressed';
    return;
  end if;

  if exists (
    select 1 from suppression_entries
    where email_address_id = p_email_address_id and scope = 'all_marketing' and active
  ) then
    return query select false, 'all_marketing_suppressed';
    return;
  end if;

  if exists (
    select 1 from suppression_entries
    where email_address_id = p_email_address_id
      and active
      and scope = (p_purpose::text::suppression_scope)
  ) then
    return query select false, 'purpose_suppressed';
    return;
  end if;

  select * into v_pref from communication_preferences
  where email_address_id = p_email_address_id and purpose = p_purpose;

  if not found or v_pref.status is distinct from 'opted_in' then
    return query select false, 'not_opted_in';
    return;
  end if;

  if v_pref.kind = 'single_use' and v_pref.fulfilled_at is not null then
    return query select false, 'already_fulfilled';
    return;
  end if;

  return query select true, 'allowed';
end;
$$;

grant execute on function can_send_email(uuid, permission_purpose) to authenticated;

-- ---------------------------------------------------------------------
-- admin_add_suppression: the only way any client role can create a
-- suppression entry. Records who did it and why; lifting uses the RLS
-- update policy above instead so the change is visible as a normal
-- column update rather than another function call.
-- ---------------------------------------------------------------------
create function admin_add_suppression(
  p_email_address_id uuid,
  p_scope suppression_scope,
  p_reason suppression_reason,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if current_app_role() <> 'admin' then
    raise exception 'only admin may add a suppression entry';
  end if;

  insert into suppression_entries (email_address_id, scope, reason, source, notes, created_by)
  values (p_email_address_id, p_scope, p_reason, 'manual', p_notes, auth.uid())
  on conflict (email_address_id, scope) where active
    do update set notes = coalesce(excluded.notes, suppression_entries.notes)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function admin_add_suppression(uuid, suppression_scope, suppression_reason, text) to authenticated;
