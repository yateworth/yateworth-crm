-- Stage 4 assertions (docs/crm-functionality-plan.md).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/survey_management.sql

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
  v_count int;
begin
  -- 1. list_surveys returns the known survey for an authorised caller
  select count(*) into v_count from list_surveys() where slug = 'australian-legal-survey';
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_count = 1 then 'PASS 1: list_surveys returns the known survey'
    else format('FAIL 1: expected 1 row, got %s', v_count) end);

  -- 2. set_survey_status rejects an invalid status
  v_seq := v_seq + 1;
  begin
    perform set_survey_status('australian-legal-survey', 'not-a-real-status');
    insert into test_results values (v_seq, 'FAIL 2: an invalid status was accepted');
  exception when others then
    insert into test_results values (v_seq, 'PASS 2: an invalid status is rejected');
  end;

  -- 3. set_survey_status actually updates the row, then restores it -
  -- the survey must stay 'draft' in real data (not yet publicly ready:
  -- pay bands/closing date are still placeholders), so this flips it
  -- and flips it straight back within the same rolled-back transaction
  update surveys set status = 'closed' where slug = 'australian-legal-survey'; -- baseline for the test
  perform set_survey_status('australian-legal-survey', 'open');

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select status from surveys where slug = 'australian-legal-survey') = 'open'
    then 'PASS 3: set_survey_status updates the row'
    else 'FAIL 3: status did not update' end);

  -- 4. an unauthorised caller cannot call set_survey_status
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  v_seq := v_seq + 1;
  begin
    perform set_survey_status('australian-legal-survey', 'closed');
    insert into test_results values (v_seq, 'FAIL 4: an unauthorised caller changed survey status');
  exception when others then
    insert into test_results values (v_seq, 'PASS 4: set_survey_status rejects an unauthorised caller');
  end;

  -- 5. an unauthorised caller cannot list surveys
  v_seq := v_seq + 1;
  begin
    perform list_surveys();
    insert into test_results values (v_seq, 'FAIL 5: an unauthorised caller was able to call list_surveys');
  exception when others then
    insert into test_results values (v_seq, 'PASS 5: list_surveys rejects an unauthorised caller');
  end;
end $$;

select * from test_results order by seq;

rollback;
