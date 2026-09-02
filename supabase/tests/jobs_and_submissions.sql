-- Stage 3 assertions (docs/crm-functionality-plan.md). set local role
-- authenticated is required - see "A testing gap, found and fixed" in
-- the README; without it this test would silently pass regardless of
-- whether the RLS policies are even correct.
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/jobs_and_submissions.sql

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
  v_firm_id uuid;
  v_candidate_id uuid;
  v_job_id uuid;
  v_submission_id uuid;
begin
  insert into firms (name) values ('Stage 3 test firm') returning id into v_firm_id;
  v_candidate_id := create_candidate('Pipe', 'Linetest', 'pipe.linetest@example-seed.test');

  -- 1. create a job against a firm
  insert into jobs (firm_id, title, status, practice_area)
  values (v_firm_id, 'Senior Associate, Commercial', 'open', 'Commercial')
  returning id into v_job_id;

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (select 1 from jobs where id = v_job_id and status = 'open')
    then 'PASS 1: job created against a firm'
    else 'FAIL 1: job not created correctly' end);

  -- 2. submit the candidate to the job at the default stage
  insert into submissions (job_id, candidate_id, source, created_by)
  values (v_job_id, v_candidate_id, 'manual', auth.uid())
  returning id into v_submission_id;

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select stage from submissions where id = v_submission_id) = 'longlist'
    then 'PASS 2: submission created at the default longlist stage'
    else 'FAIL 2: submission not created at the expected default stage' end);

  -- 3. a candidate cannot be submitted to the same job twice
  v_seq := v_seq + 1;
  begin
    insert into submissions (job_id, candidate_id) values (v_job_id, v_candidate_id);
    insert into test_results values (v_seq, 'FAIL 3: the same candidate was submitted to the same job twice');
  exception when others then
    insert into test_results values (v_seq, 'PASS 3: duplicate submission to the same job is rejected');
  end;

  -- 4. move the submission through the pipeline
  update submissions set stage = 'interview' where id = v_submission_id;

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select stage from submissions where id = v_submission_id) = 'interview'
    then 'PASS 4: submission stage can be updated'
    else 'FAIL 4: submission stage did not update' end);

  -- 5. a caller with no active profile cannot see or write jobs/submissions
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select count(*) from jobs where id = v_job_id) = 0
    then 'PASS 5: jobs invisible to a caller with no active profile'
    else 'FAIL 5: job was visible to an unauthorised caller' end);

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select count(*) from submissions where id = v_submission_id) = 0
    then 'PASS 6: submissions invisible to a caller with no active profile'
    else 'FAIL 6: submission was visible to an unauthorised caller' end);

  v_seq := v_seq + 1;
  begin
    insert into jobs (firm_id, title) values (v_firm_id, 'Should not be insertable');
    insert into test_results values (v_seq, 'FAIL 7: an unauthorised caller inserted a job');
  exception when others then
    insert into test_results values (v_seq, 'PASS 7: job insert correctly rejected for an unauthorised caller');
  end;
end $$;

select * from test_results order by seq;

rollback;
