-- Placements assertions (migration 24) — direct-table RLS, following the
-- direct_table_rls.sql pattern since placements has no wrapper function.
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/placements.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
create temporary table test_ids (submission_id uuid, second_submission_id uuid) on commit drop;
grant select, insert on test_results to authenticated;
grant select on test_ids to authenticated;

do $$
declare
  v_firm_id uuid;
  v_job_id uuid;
  v_person_id uuid;
  v_submission_id uuid;
  v_second_submission_id uuid;
begin
  insert into firms (name) values ('Placement Test Firm') returning id into v_firm_id;
  insert into jobs (firm_id, title, fee_percent) values (v_firm_id, 'Placement Test Job', 20)
  returning id into v_job_id;

  insert into people (first_name, last_name, status) values ('Place', 'Ment', 'active') returning id into v_person_id;
  insert into candidate_profiles (person_id, candidate_status) values (v_person_id, 'placed');

  insert into submissions (job_id, candidate_id, stage) values (v_job_id, v_person_id, 'placed')
  returning id into v_submission_id;

  -- a second job/submission for the same candidate, to test the one-placement-per-submission constraint
  insert into jobs (firm_id, title) values (v_firm_id, 'Second Placement Test Job') returning id into v_job_id;
  insert into submissions (job_id, candidate_id, stage) values (v_job_id, v_person_id, 'placed')
  returning id into v_second_submission_id;

  insert into test_ids (submission_id, second_submission_id) values (v_submission_id, v_second_submission_id);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

do $$
declare
  v_seq int := 0;
  v_submission_id uuid;
  v_second_submission_id uuid;
  v_placement_id uuid;
  v_fee numeric;
begin
  select submission_id, second_submission_id into v_submission_id, v_second_submission_id from test_ids;

  -- 1. recruiter/admin can record a placement
  insert into placements (submission_id, start_date, salary, fee_amount, guarantee_end_date)
  values (v_submission_id, current_date, 150000, 30000, current_date + interval '3 months')
  returning id into v_placement_id;
  select fee_amount into v_fee from placements where id = v_placement_id;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_fee = 30000 then 'PASS 1: recruiter/admin can record a placement'
    else format('FAIL 1: fee_amount=%s', v_fee) end);

  -- 2. only one placement per submission
  v_seq := v_seq + 1;
  begin
    insert into placements (submission_id, fee_amount) values (v_submission_id, 1000);
    insert into test_results values (v_seq, 'FAIL 2: a second placement was allowed for the same submission');
  exception when others then
    insert into test_results values (v_seq, 'PASS 2: only one placement per submission is allowed');
  end;

  -- 3. invoice_status can be updated
  update placements set invoice_status = 'invoiced' where id = v_placement_id;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select invoice_status from placements where id = v_placement_id) = 'invoiced'
    then 'PASS 3: invoice_status can be updated'
    else 'FAIL 3: invoice_status did not update' end);

  -- 4. a placement can be recorded against a different submission for the same candidate
  v_seq := v_seq + 1;
  begin
    insert into placements (submission_id, fee_amount) values (v_second_submission_id, 5000);
    insert into test_results values (v_seq, 'PASS 4: a placement against a different submission is allowed');
  exception when others then
    insert into test_results values (v_seq, 'FAIL 4: a valid second placement was rejected');
  end;
end $$;

-- 5. an unauthorised (viewer-shaped) caller cannot read placements — placements
-- has no viewer-select policy at all, unlike jobs/firms.
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
insert into test_results
  select 5, case when count(*) = 0 then 'PASS 5: an unrecognised caller sees no placements'
    else 'FAIL 5: an unrecognised caller could read placements' end
  from placements;

select * from test_results order by seq;

rollback;
