-- Milestone 6 assertions. Wrapped in BEGIN/ROLLBACK.
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/report_delivery_and_reporting.sql

begin;

-- Impersonate an active admin for the duration of this test transaction
-- only. claim_report_batch/record_report_delivered/survey_aggregate_report/
-- dashboard_summary now correctly require an active admin/marketing
-- profile (see migration 15) - this test SQL runs with no real JWT
-- (via the Management API), so it needs a stand-in the same way any
-- other privileged-role test would.
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
  v_email_id uuid;
  v_request_id uuid;
  v_claimed_count int;
  v_report jsonb;
  v_nsw_option jsonb;
  i int;
  v_each_email uuid;
begin
  -- --- report delivery ---

  insert into email_addresses (email) values ('m6.a@example-seed.test') returning id into v_email_id;
  insert into communication_preferences (email_address_id, purpose, status, kind, source)
  values (v_email_id, 'report', 'opted_in', 'single_use', 'test_fixture');
  insert into report_requests (email_address_id, report_code, status)
  values (v_email_id, 'legal_survey_report', 'requested')
  returning id into v_request_id;

  -- 1. claim_report_batch claims the eligible request
  select count(*) into v_claimed_count from claim_report_batch('legal_survey_report', 10);
  insert into test_results values (1,
    case when v_claimed_count = 1 then 'PASS 1: eligible report request claimed'
    else format('FAIL 1: expected 1 claimed, got %s', v_claimed_count) end);

  -- 2. record_report_delivered marks delivered and fulfils the preference
  perform record_report_delivered(v_request_id);
  insert into test_results values (2,
    case when (select status from report_requests where id = v_request_id) = 'delivered'
      and (select fulfilled_at from communication_preferences where email_address_id = v_email_id and purpose = 'report') is not null
    then 'PASS 2: request marked delivered and preference fulfilled'
    else 'FAIL 2: delivery did not update state correctly' end);

  -- 3. can_send_email now blocks a repeat send of the same report...
  insert into test_results values (3,
    case when not (select allowed from can_send_email(v_email_id, 'report'))
    then 'PASS 3: fulfilled report is blocked from re-send'
    else 'FAIL 3: fulfilled report still shows as sendable' end);

  -- 4. ...but re-requesting (Milestone 3's submit_permission_request)
  -- resets it, and a new claim call picks it up again
  perform submit_permission_request(p_email := 'm6.a@example-seed.test', p_report := true);
  select count(*) into v_claimed_count from claim_report_batch('legal_survey_report', 10);
  insert into test_results values (4,
    case when v_claimed_count = 1 then 'PASS 4: re-requesting makes the report claimable again'
    else format('FAIL 4: expected 1 claimed after re-request, got %s', v_claimed_count) end);

  -- 5. an unsubscribed/suppressed address is not claimed, and is marked
  -- failed rather than left stuck as 'requested' forever
  declare
    v_email2_id uuid;
    v_request2_id uuid;
  begin
    insert into email_addresses (email) values ('m6.b@example-seed.test') returning id into v_email2_id;
    insert into suppression_entries (email_address_id, scope, reason, source)
    values (v_email2_id, 'all_email', 'hard_bounce', 'test_fixture');
    insert into report_requests (email_address_id, report_code, status)
    values (v_email2_id, 'legal_survey_report', 'requested')
    returning id into v_request2_id;

    select count(*) into v_claimed_count from claim_report_batch('legal_survey_report', 10);
    insert into test_results values (5,
      case when v_claimed_count = 0 and (select status from report_requests where id = v_request2_id) = 'failed'
      then 'PASS 5: suppressed address is not claimed and marked failed'
      else 'FAIL 5: suppressed address was claimed or left in the wrong state' end);
  end;

  -- --- safe aggregate survey reporting ---

  -- open the survey, submit exactly 4 NSW responses (below threshold)
  update surveys set status = 'open' where slug = 'australian-legal-survey';
  for i in 1..4 loop
    perform submit_survey_response('australian-legal-survey', jsonb_build_object('state', 'NSW'));
  end loop;

  select survey_aggregate_report('australian-legal-survey') into v_report;
  select opt into v_nsw_option
  from jsonb_array_elements(v_report -> 'questions') q,
       jsonb_array_elements(q -> 'options') opt
  where q ->> 'key' = 'state' and opt ->> 'value' = 'NSW';

  v_seq := 6;
  insert into test_results values (v_seq,
    case when (v_nsw_option ->> 'suppressed')::boolean = true and v_nsw_option -> 'count' = 'null'::jsonb
    then 'PASS 6: 4 responses (below threshold of 5) is reported as suppressed, count withheld'
    else format('FAIL 6: expected suppressed/null count, got %s', v_nsw_option) end);

  -- one more NSW response crosses the threshold
  perform submit_survey_response('australian-legal-survey', jsonb_build_object('state', 'NSW'));

  select survey_aggregate_report('australian-legal-survey') into v_report;
  select opt into v_nsw_option
  from jsonb_array_elements(v_report -> 'questions') q,
       jsonb_array_elements(q -> 'options') opt
  where q ->> 'key' = 'state' and opt ->> 'value' = 'NSW';

  v_seq := 7;
  insert into test_results values (v_seq,
    case when (v_nsw_option ->> 'suppressed')::boolean = false and (v_nsw_option ->> 'count')::int = 5
    then 'PASS 7: the 5th response crosses the threshold and the real count is shown'
    else format('FAIL 7: expected count=5/not suppressed, got %s', v_nsw_option) end);

  -- 8. total_responses is an honest total regardless of per-option suppression
  v_seq := 8;
  insert into test_results values (v_seq,
    case when (v_report ->> 'total_responses')::int = 5
    then 'PASS 8: total_responses counts every response, suppressed or not'
    else format('FAIL 8: expected total_responses=5, got %s', v_report ->> 'total_responses') end);

  -- 9. dashboard_summary returns counts, not identifiable rows
  v_seq := 9;
  declare
    v_summary jsonb;
  begin
    select dashboard_summary() into v_summary;
    insert into test_results values (v_seq,
      case when v_summary ? 'report_requests' and v_summary ? 'active_suppressions_by_reason'
      then 'PASS 9: dashboard_summary returns the expected top-level keys'
      else 'FAIL 9: dashboard_summary missing expected keys' end);
  end;
end $$;

select * from test_results order by seq;

rollback;
