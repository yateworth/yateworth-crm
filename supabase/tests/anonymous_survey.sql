-- Milestone 3 assertions. Wrapped in BEGIN/ROLLBACK — nothing here
-- persists, including the temporary status='open' flip on the real
-- survey row (rolled back along with everything else).
--
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/anonymous_survey.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
  v_survey jsonb;
  v_response_id uuid;
  v_email_id uuid;
  v_leftover_column_count int;
begin
  -- 0. schema-level proof: survey_responses and survey_answers have no
  -- column that could reference an email, person or candidate identity.
  v_seq := v_seq + 1;
  select count(*) into v_leftover_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('survey_responses', 'survey_answers')
    and column_name in ('email_address_id', 'person_id', 'candidate_id', 'email', 'report_request_id');
  insert into test_results values (v_seq,
    case when v_leftover_column_count = 0
      then 'PASS 0a: survey_responses/survey_answers carry no identity column'
      else format('FAIL 0a: found %s identity-shaped column(s) on survey tables', v_leftover_column_count)
    end);

  v_seq := v_seq + 1;
  select count(*) into v_leftover_column_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'report_requests'
    and column_name in ('response_id', 'survey_response_id');
  insert into test_results values (v_seq,
    case when v_leftover_column_count = 0
      then 'PASS 0b: report_requests carries no survey_responses reference'
      else 'FAIL 0b: report_requests references a survey response'
    end);

  -- 1. a draft survey is not exposed
  v_seq := v_seq + 1;
  select get_active_survey('australian-legal-survey') into v_survey;
  insert into test_results values (v_seq,
    case when v_survey is null
      then 'PASS 1: draft survey is not returned by get_active_survey'
      else 'FAIL 1: draft survey was exposed'
    end);

  -- open it for the rest of this test (rolled back at the end)
  update surveys set status = 'open' where slug = 'australian-legal-survey';

  -- 2. now it's visible, with all 10 questions and the right option counts
  v_seq := v_seq + 1;
  select get_active_survey('australian-legal-survey') into v_survey;
  insert into test_results values (v_seq,
    case when jsonb_array_length(v_survey -> 'questions') = 10
      then 'PASS 2: open survey exposes all 10 questions'
      else format('FAIL 2: expected 10 questions, got %s', jsonb_array_length(v_survey -> 'questions'))
    end);

  -- 3. submitting a full response works, with no identifying parameter
  -- accepted anywhere in the function signature
  v_seq := v_seq + 1;
  begin
    perform submit_survey_response('australian-legal-survey', jsonb_build_object(
      'state', 'NSW', 'role', 'Lawyer', 'area', 'Commercial', 'req', '3', 'act', '2',
      'target', 'Usually', 'hours', '43-47', 'pay', 'b4', 'stay', 'Likely'
    ));
    insert into test_results values (v_seq, 'PASS 3: full response accepted');
  exception when others then
    insert into test_results values (v_seq, format('FAIL 3: unexpected error: %s', sqlerrm));
  end;

  -- 4. an unknown question key is rejected
  v_seq := v_seq + 1;
  begin
    perform submit_survey_response('australian-legal-survey', jsonb_build_object('not_a_real_question', 'x'));
    insert into test_results values (v_seq, 'FAIL 4: unknown question key was accepted');
  exception when others then
    insert into test_results values (v_seq, 'PASS 4: unknown question key rejected');
  end;

  -- 5. an invalid option value is rejected
  v_seq := v_seq + 1;
  begin
    perform submit_survey_response('australian-legal-survey', jsonb_build_object('state', 'Atlantis'));
    insert into test_results values (v_seq, 'FAIL 5: invalid option value was accepted');
  exception when others then
    insert into test_results values (v_seq, 'PASS 5: invalid option value rejected');
  end;

  -- 6. an all-optional response with zero answers is still accepted
  -- (this survey has no required questions, matching the live site copy)
  v_seq := v_seq + 1;
  begin
    perform submit_survey_response('australian-legal-survey', '{}'::jsonb);
    insert into test_results values (v_seq, 'PASS 6: an empty (all-skipped) response is accepted');
  exception when others then
    insert into test_results values (v_seq, format('FAIL 6: empty response rejected: %s', sqlerrm));
  end;

  -- 7. the permission/report request is a fully separate call: it
  -- creates an email identity and a report request, and does not touch
  -- survey_responses/survey_answers at all
  v_seq := v_seq + 1;
  perform submit_permission_request(
    p_email := 'milestone3.test@example-seed.test',
    p_report := true,
    p_blog := false,
    p_recruitment := false
  );
  select id into v_email_id from email_addresses where email = 'milestone3.test@example-seed.test';
  insert into test_results values (v_seq,
    case when v_email_id is not null and exists (
      select 1 from report_requests where email_address_id = v_email_id and report_code = 'legal_survey_report'
    )
      then 'PASS 7: permission request creates email identity + report request'
      else 'FAIL 7: permission request did not create the expected rows'
    end);

  -- 8. the report is now sendable
  v_seq := v_seq + 1;
  if (select allowed from can_send_email(v_email_id, 'report')) then
    insert into test_results values (v_seq, 'PASS 8: freshly requested report is sendable');
  else
    insert into test_results values (v_seq, 'FAIL 8: freshly requested report was not sendable');
  end if;

  -- 9. mark it fulfilled, then re-request — must become sendable again
  -- (this is the fulfilled_at reset fix)
  update communication_preferences set fulfilled_at = now()
  where email_address_id = v_email_id and purpose = 'report';

  v_seq := v_seq + 1;
  if (select allowed from can_send_email(v_email_id, 'report')) then
    insert into test_results values (v_seq, 'FAIL 9: expected fulfilled report to be blocked before re-request');
  else
    insert into test_results values (v_seq, 'PASS 9: fulfilled report is blocked before re-request, as expected');
  end if;

  perform submit_permission_request(p_email := 'milestone3.test@example-seed.test', p_report := true);

  v_seq := v_seq + 1;
  if (select allowed from can_send_email(v_email_id, 'report')) then
    insert into test_results values (v_seq, 'PASS 10: re-requesting after fulfilment makes the report sendable again');
  else
    insert into test_results values (v_seq, 'FAIL 10: re-request did not reset fulfilled_at');
  end if;

  -- 11. an opted-out preference is never silently reinstated by a
  -- resubmission
  update communication_preferences set status = 'opted_out'
  where email_address_id = v_email_id and purpose = 'report';

  perform submit_permission_request(p_email := 'milestone3.test@example-seed.test', p_report := true);

  v_seq := v_seq + 1;
  if (select status from communication_preferences where email_address_id = v_email_id and purpose = 'report') = 'opted_out' then
    insert into test_results values (v_seq, 'PASS 11: opted_out preference survives a resubmission');
  else
    insert into test_results values (v_seq, 'FAIL 11: resubmission overrode an explicit opt-out');
  end if;

  -- 12. confirm the two flows never shared an identifier: no
  -- survey_responses row exists that references anything from the
  -- permission-request path (nothing to query by construction, so this
  -- just confirms the response count from step 3/6 matches expectations
  -- with no extra rows created by steps 7-11)
  v_seq := v_seq + 1;
  if (select count(*) from survey_responses) = 2 then
    insert into test_results values (v_seq, 'PASS 12: permission-request calls created zero survey_responses rows');
  else
    insert into test_results values (v_seq, format('FAIL 12: expected exactly 2 survey_responses, found %s', (select count(*) from survey_responses)));
  end if;
end $$;

select * from test_results order by seq;

rollback;
