-- Phase 1, Milestone 4: templates, mailing lists, campaign previews,
-- recipient snapshots and atomic batch claiming. Uses a fake email
-- provider (see netlify/functions/_shared/emailProvider.ts) - no real
-- provider credentials exist yet, per the spec's own milestone 4
-- instruction to build against a fake adapter first.

create type campaign_status as enum ('draft', 'scheduled', 'sending', 'paused', 'completed', 'cancelled');
create type recipient_status as enum ('pending', 'suppressed', 'queued', 'sent', 'delivered', 'bounced', 'complained', 'unsubscribed', 'failed', 'cancelled');

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

create trigger email_templates_set_updated_at before update on email_templates
  for each row execute function set_updated_at();
create trigger campaign_recipients_set_updated_at before update on campaign_recipients
  for each row execute function set_updated_at();

alter table mailing_lists enable row level security;
alter table mailing_list_members enable row level security;
alter table email_templates enable row level security;
alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;
alter table email_messages enable row level security;
alter table email_events enable row level security;

-- Marketing owns templates/lists/campaigns per the spec's role table.
-- Recipient snapshots and message/event logs are read-only even for
-- marketing - they're evidence of what was actually sent, not something
-- to hand-edit; only admin manages those two, and only for oversight.
create policy "mailing_lists_marketing_admin_all" on mailing_lists for all
  to authenticated using (current_app_role() in ('admin', 'marketing'))
  with check (current_app_role() in ('admin', 'marketing'));
create policy "mailing_list_members_marketing_admin_all" on mailing_list_members for all
  to authenticated using (current_app_role() in ('admin', 'marketing'))
  with check (current_app_role() in ('admin', 'marketing'));
create policy "email_templates_marketing_admin_all" on email_templates for all
  to authenticated using (current_app_role() in ('admin', 'marketing'))
  with check (current_app_role() in ('admin', 'marketing'));
create policy "campaigns_marketing_admin_all" on campaigns for all
  to authenticated using (current_app_role() in ('admin', 'marketing'))
  with check (current_app_role() in ('admin', 'marketing'));

create policy "campaign_recipients_admin_marketing_select" on campaign_recipients for select
  to authenticated using (current_app_role() in ('admin', 'marketing'));
create policy "email_messages_admin_marketing_select" on email_messages for select
  to authenticated using (current_app_role() in ('admin', 'marketing'));
create policy "email_events_admin_select" on email_events for select
  to authenticated using (current_app_role() = 'admin');

-- No direct client insert/update/delete on campaign_recipients,
-- email_messages or email_events: those are written only by the
-- SECURITY DEFINER functions below and, in Milestone 5, by webhook
-- processing running as the service role.

-- ---------------------------------------------------------------------
-- generate_campaign_recipients: freezes the target list's current
-- members into campaign_recipients, snapshotting each one's eligibility
-- via can_send_email() at snapshot time - this is the "eligibility
-- preview" the spec's campaign-creation step 4 asks for. Re-runnable
-- (e.g. to pick up new list members before sending) without duplicating
-- existing rows.
-- ---------------------------------------------------------------------
create function generate_campaign_recipients(p_campaign_id uuid)
returns table(status recipient_status, count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_member record;
  v_eligibility record;
  v_status recipient_status;
begin
  select * into v_campaign from campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign not found';
  end if;
  if v_campaign.list_id is null then
    raise exception 'campaign has no target list';
  end if;

  for v_member in
    select m.email_address_id, ea.email
    from mailing_list_members m
    join email_addresses ea on ea.id = m.email_address_id
    where m.list_id = v_campaign.list_id and m.removed_at is null
  loop
    select * into v_eligibility from can_send_email(v_member.email_address_id, v_campaign.purpose);
    v_status := case when v_eligibility.allowed then 'pending' else 'suppressed' end;

    insert into campaign_recipients (campaign_id, email_address_id, email_snapshot, eligibility_snapshot, status, suppression_reason)
    values (
      p_campaign_id, v_member.email_address_id, v_member.email,
      jsonb_build_object('allowed', v_eligibility.allowed, 'reason', v_eligibility.reason, 'snapshotted_at', now()),
      v_status,
      case when not v_eligibility.allowed then v_eligibility.reason end
    )
    on conflict (campaign_id, email_address_id) do nothing;
  end loop;

  return query
    select cr.status, count(*) from campaign_recipients cr
    where cr.campaign_id = p_campaign_id
    group by cr.status;
end;
$$;

grant execute on function generate_campaign_recipients(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- claim_campaign_batch: the only way recipients move from pending to
-- queued. FOR UPDATE SKIP LOCKED so two concurrent callers can never
-- claim the same row, and can_send_email() is re-checked here - not just
-- trusted from the snapshot - so an opt-out or suppression that happened
-- after the preview still blocks the send.
-- ---------------------------------------------------------------------
create function claim_campaign_batch(p_campaign_id uuid, p_batch_size int default 50)
returns setof campaign_recipients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purpose permission_purpose;
  v_row campaign_recipients%rowtype;
  v_eligibility record;
begin
  select purpose into v_purpose from campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign not found';
  end if;

  for v_row in
    select cr.* from campaign_recipients cr
    where cr.campaign_id = p_campaign_id and cr.status = 'pending'
    order by cr.created_at
    limit p_batch_size
    for update skip locked
  loop
    select * into v_eligibility from can_send_email(v_row.email_address_id, v_purpose);

    if v_eligibility.allowed then
      update campaign_recipients
        set status = 'queued', updated_at = now()
        where id = v_row.id;
      v_row.status := 'queued';
      return next v_row;
    else
      update campaign_recipients
        set status = 'suppressed', suppression_reason = v_eligibility.reason, updated_at = now()
        where id = v_row.id;
    end if;
  end loop;
  return;
end;
$$;

grant execute on function claim_campaign_batch(uuid, int) to authenticated;
