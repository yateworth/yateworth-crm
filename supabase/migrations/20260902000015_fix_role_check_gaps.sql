-- Security fix, found while building Milestone 6 and verified live
-- before writing this fix: `IF current_app_role() <> 'admin'` (or
-- `NOT IN (...)`) silently evaluates to NULL, which PL/pgSQL's IF
-- treats as false - so the guard never fires for a caller with no
-- active profile row at all (a brand new sign-up nobody has approved
-- yet, or a deactivated account). Confirmed live:
--
--   select current_app_role() <> 'admin';  -- returns NULL, not true
--
-- Fixed here with an explicit NULL check rather than a clever operator,
-- so it reads unambiguously correct on inspection.
--
-- Separately, and worse: generate_campaign_recipients, claim_campaign_batch
-- and record_email_sent had NO role check at all - only the blanket
-- `GRANT EXECUTE ... TO authenticated`, meaning any authenticated user
-- regardless of profiles.role or profiles.active (a 'viewer', or an
-- unapproved sign-up) could generate campaign recipient snapshots, claim
-- and "send" a batch, or record a message as sent for any campaign.
-- These are marketing's tools per the spec's role table; admin/marketing
-- only, now actually enforced.

create or replace function admin_add_suppression(
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
  if current_app_role() is null or current_app_role() <> 'admin' then
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

create or replace function generate_campaign_recipients(p_campaign_id uuid)
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
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

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

create or replace function claim_campaign_batch(p_campaign_id uuid, p_batch_size int default 50)
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
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

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

create or replace function record_email_sent(
  p_campaign_recipient_id uuid,
  p_provider text,
  p_provider_message_id text,
  p_subject_snapshot text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient campaign_recipients%rowtype;
  v_message_id uuid;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

  select * into v_recipient from campaign_recipients where id = p_campaign_recipient_id;
  if not found then
    raise exception 'campaign recipient not found';
  end if;

  insert into email_messages (campaign_recipient_id, email_address_id, purpose, provider, provider_message_id, subject_snapshot, status, sent_at)
  select p_campaign_recipient_id,
         v_recipient.email_address_id,
         c.purpose,
         p_provider,
         p_provider_message_id,
         p_subject_snapshot,
         'sent',
         now()
  from campaigns c where c.id = v_recipient.campaign_id
  returning id into v_message_id;

  update campaign_recipients set status = 'sent', updated_at = now()
  where id = p_campaign_recipient_id;

  return v_message_id;
end;
$$;

-- Same two gaps, same fix, for the Milestone 6 functions pushed in the
-- same session as this fix (claim_report_batch/record_report_delivered
-- had no check at all; survey_aggregate_report/dashboard_summary had
-- the same NULL-unsafe NOT IN).

create or replace function claim_report_batch(p_report_code text default 'legal_survey_report', p_batch_size int default 50)
returns setof report_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row report_requests%rowtype;
  v_eligibility record;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

  for v_row in
    select rr.* from report_requests rr
    where rr.report_code = p_report_code and rr.status = 'requested'
    order by rr.requested_at
    limit p_batch_size
    for update skip locked
  loop
    select * into v_eligibility from can_send_email(v_row.email_address_id, 'report');

    if v_eligibility.allowed then
      update report_requests set status = 'sending' where id = v_row.id;
      v_row.status := 'sending';
      return next v_row;
    else
      update report_requests set status = 'failed' where id = v_row.id;
    end if;
  end loop;
  return;
end;
$$;

create or replace function record_report_delivered(p_report_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request report_requests%rowtype;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

  select * into v_request from report_requests where id = p_report_request_id;
  if not found then
    raise exception 'report request not found';
  end if;

  update report_requests set status = 'delivered', delivered_at = now()
  where id = p_report_request_id;

  update communication_preferences set fulfilled_at = now()
  where email_address_id = v_request.email_address_id and purpose = 'report';
end;
$$;

create or replace function survey_aggregate_report(p_slug text, p_min_cohort int default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_survey_id uuid;
  v_total_responses bigint;
  v_result jsonb;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

  select id into v_survey_id from surveys where slug = p_slug;
  if not found then
    raise exception 'survey not found';
  end if;

  select count(*) into v_total_responses from survey_responses where survey_id = v_survey_id;

  select jsonb_build_object(
    'slug', p_slug,
    'total_responses', v_total_responses,
    'min_cohort', p_min_cohort,
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', q.question_key,
        'type', q.question_type,
        'options', (
          case when q.question_type = 'single_choice' then (
            select coalesce(jsonb_agg(jsonb_build_object(
              'value', counts.answer_value,
              'count', case when counts.n >= p_min_cohort then counts.n else null end,
              'suppressed', counts.n < p_min_cohort
            ) order by counts.answer_value), '[]'::jsonb)
            from (
              select (sa.answer #>> '{}') as answer_value, count(*) as n
              from survey_answers sa
              where sa.question_id = q.id
              group by sa.answer
            ) counts
          ) else null end
        )
      ) order by q.position), '[]'::jsonb)
      from survey_questions q where q.survey_id = v_survey_id
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

  return jsonb_build_object(
    'report_requests', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) as n from report_requests group by status) t
    ),
    'opt_ins', (
      select coalesce(jsonb_object_agg(purpose, n), '{}'::jsonb)
      from (
        select purpose, count(*) as n from communication_preferences
        where status = 'opted_in' group by purpose
      ) t
    ),
    'active_suppressions_by_reason', (
      select coalesce(jsonb_object_agg(reason, n), '{}'::jsonb)
      from (select reason, count(*) as n from suppression_entries where active group by reason) t
    ),
    'campaign_recipient_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) as n from campaign_recipients group by status) t
    ),
    'email_message_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) as n from email_messages group by status) t
    )
  );
end;
$$;
