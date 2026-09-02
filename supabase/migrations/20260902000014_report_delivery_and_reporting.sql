-- Phase 1, Milestone 6: report delivery and safe aggregate reporting.

-- ---------------------------------------------------------------------
-- claim_report_batch: same pattern as claim_campaign_batch, for
-- report_requests instead of campaign_recipients. Re-checks
-- can_send_email() at claim time (someone may have unsubscribed or
-- bounced between requesting the report and now), FOR UPDATE SKIP
-- LOCKED so two workers can't claim the same request.
-- ---------------------------------------------------------------------
create function claim_report_batch(p_report_code text default 'legal_survey_report', p_batch_size int default 50)
returns setof report_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row report_requests%rowtype;
  v_eligibility record;
begin
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

grant execute on function claim_report_batch(text, int) to authenticated;

-- ---------------------------------------------------------------------
-- record_report_delivered: marks the request delivered AND marks the
-- single-use report preference fulfilled - reusing the exact mechanic
-- Milestone 3 already tested (fulfilled_at reset on the next opt-in), so
-- a future re-request naturally starts a fresh delivery cycle instead of
-- staying silently blocked.
-- ---------------------------------------------------------------------
create function record_report_delivered(p_report_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request report_requests%rowtype;
begin
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

grant execute on function record_report_delivered(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- survey_aggregate_report: per-question option counts, admin/marketing
-- only. Any option with fewer than 5 responses is reported as
-- suppressed (count omitted, not merely rounded or hidden) rather than
-- silently dropped from the list, per the spec's "say where we have
-- done it" - a viewer sees exactly which options exist and which are
-- currently below the reporting threshold.
-- ---------------------------------------------------------------------
create function survey_aggregate_report(p_slug text, p_min_cohort int default 5)
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
  if current_app_role() not in ('admin', 'marketing') then
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

grant execute on function survey_aggregate_report(text, int) to authenticated;

-- ---------------------------------------------------------------------
-- dashboard_summary: the operational counts from spec section 12 that
-- exist at this milestone - report requests/delivery, opt-ins, active
-- suppressions by reason, campaign send outcomes. Admin/marketing only;
-- every number here is a count, never an identifiable record.
-- ---------------------------------------------------------------------
create function dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if current_app_role() not in ('admin', 'marketing') then
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

grant execute on function dashboard_summary() to authenticated;
