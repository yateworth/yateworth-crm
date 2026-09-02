-- Regression test for a real bug found while building Milestone 6:
-- `IF current_app_role() <> 'admin'` (or `NOT IN (...)`) silently
-- evaluates to NULL - which PL/pgSQL's IF treats as false - for a
-- caller with no active profile row, so the guard never fired. Three
-- functions (generate_campaign_recipients, claim_campaign_batch,
-- record_email_sent) had no role check at all. See migration 15 for the
-- fix. This file exists so that pattern never silently regresses.
--
-- Every assertion here checks the error message actually says "not
-- authorised" (or admin_add_suppression's specific wording) - not just
-- "some exception was thrown" - so a function failing for the wrong
-- reason (e.g. "not found") would correctly show as a FAIL, not a
-- false-positive PASS.
--
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/role_check_regression.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
  v_email_id uuid;
begin
  -- deliberately NOT impersonating anyone - current_app_role() must be
  -- NULL for this whole test, which is exactly the case that was buggy
  insert into email_addresses (email) values ('rolefix.test@example-seed.test') returning id into v_email_id;

  v_seq := v_seq + 1;
  begin
    perform admin_add_suppression(v_email_id, 'blog', 'manual');
    insert into test_results values (v_seq, 'FAIL: admin_add_suppression did not block an unauthorised caller');
  exception when others then
    insert into test_results values (v_seq,
      case when sqlerrm like '%admin%' then 'PASS: admin_add_suppression blocks an unauthorised caller'
      else format('FAIL: admin_add_suppression raised the wrong error: %s', sqlerrm) end);
  end;

  v_seq := v_seq + 1;
  begin
    perform generate_campaign_recipients('00000000-0000-0000-0000-000000000000');
    insert into test_results values (v_seq, 'FAIL: generate_campaign_recipients did not block an unauthorised caller');
  exception when others then
    insert into test_results values (v_seq,
      case when sqlerrm like '%not authorised%' then 'PASS: generate_campaign_recipients blocks an unauthorised caller'
      else format('FAIL: generate_campaign_recipients raised the wrong error: %s', sqlerrm) end);
  end;

  v_seq := v_seq + 1;
  begin
    perform claim_campaign_batch('00000000-0000-0000-0000-000000000000', 1);
    insert into test_results values (v_seq, 'FAIL: claim_campaign_batch did not block an unauthorised caller');
  exception when others then
    insert into test_results values (v_seq,
      case when sqlerrm like '%not authorised%' then 'PASS: claim_campaign_batch blocks an unauthorised caller'
      else format('FAIL: claim_campaign_batch raised the wrong error: %s', sqlerrm) end);
  end;

  v_seq := v_seq + 1;
  begin
    perform record_email_sent('00000000-0000-0000-0000-000000000000', 'fake', 'x', 'x');
    insert into test_results values (v_seq, 'FAIL: record_email_sent did not block an unauthorised caller');
  exception when others then
    insert into test_results values (v_seq,
      case when sqlerrm like '%not authorised%' then 'PASS: record_email_sent blocks an unauthorised caller'
      else format('FAIL: record_email_sent raised the wrong error: %s', sqlerrm) end);
  end;

  v_seq := v_seq + 1;
  begin
    perform claim_report_batch('legal_survey_report', 1);
    insert into test_results values (v_seq, 'FAIL: claim_report_batch did not block an unauthorised caller');
  exception when others then
    insert into test_results values (v_seq,
      case when sqlerrm like '%not authorised%' then 'PASS: claim_report_batch blocks an unauthorised caller'
      else format('FAIL: claim_report_batch raised the wrong error: %s', sqlerrm) end);
  end;

  v_seq := v_seq + 1;
  begin
    perform record_report_delivered('00000000-0000-0000-0000-000000000000');
    insert into test_results values (v_seq, 'FAIL: record_report_delivered did not block an unauthorised caller');
  exception when others then
    insert into test_results values (v_seq,
      case when sqlerrm like '%not authorised%' then 'PASS: record_report_delivered blocks an unauthorised caller'
      else format('FAIL: record_report_delivered raised the wrong error: %s', sqlerrm) end);
  end;

  v_seq := v_seq + 1;
  begin
    perform survey_aggregate_report('australian-legal-survey');
    insert into test_results values (v_seq, 'FAIL: survey_aggregate_report did not block an unauthorised caller');
  exception when others then
    insert into test_results values (v_seq,
      case when sqlerrm like '%not authorised%' then 'PASS: survey_aggregate_report blocks an unauthorised caller'
      else format('FAIL: survey_aggregate_report raised the wrong error: %s', sqlerrm) end);
  end;

  v_seq := v_seq + 1;
  begin
    perform dashboard_summary();
    insert into test_results values (v_seq, 'FAIL: dashboard_summary did not block an unauthorised caller');
  exception when others then
    insert into test_results values (v_seq,
      case when sqlerrm like '%not authorised%' then 'PASS: dashboard_summary blocks an unauthorised caller'
      else format('FAIL: dashboard_summary raised the wrong error: %s', sqlerrm) end);
  end;
end $$;

select * from test_results order by seq;

rollback;
