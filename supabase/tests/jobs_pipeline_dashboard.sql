-- Jobs pipeline dashboard assertions (migrations 28 and 30).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/jobs_pipeline_dashboard.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
grant select, insert on test_results to authenticated;

do $$
declare
  v_firm_id uuid;
  v_open_job_id uuid;
  v_won_job_id uuid;
  v_lost_job_id uuid;
  v_person_id uuid;
  v_submission_id uuid;
begin
  insert into firms (name) values ('Pipeline Test Firm') returning id into v_firm_id;

  -- an open job with a known fee_percent and salary — should get an estimated value
  insert into jobs (firm_id, title, status, opened_at, fee_percent, salary_max)
  values (v_firm_id, 'Open Job', 'open', now(), 20, 200000)
  returning id into v_open_job_id;

  -- a closed job that was won (has a placement)
  insert into jobs (firm_id, title, status, closed_at) values (v_firm_id, 'Won Job', 'filled', now())
  returning id into v_won_job_id;
  insert into people (first_name, last_name, status) values ('Pipeline', 'Winner', 'active') returning id into v_person_id;
  insert into candidate_profiles (person_id, candidate_status) values (v_person_id, 'placed');
  insert into submissions (job_id, candidate_id, stage) values (v_won_job_id, v_person_id, 'placed')
  returning id into v_submission_id;
  insert into placements (submission_id, fee_amount) values (v_submission_id, 42000);

  -- a closed job that was NOT won (no placement)
  insert into jobs (firm_id, title, status, closed_at) values (v_firm_id, 'Lost Job', 'cancelled', now())
  returning id into v_lost_job_id;

  -- a job marked filled but with no placement recorded yet — the exact bug this migration fixes:
  -- "won" must come from status alone, not require a placement to already exist
  insert into jobs (firm_id, title, status, closed_at) values (v_firm_id, 'Filled No Placement Job', 'filled', now());
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

do $$
declare
  v_seq int := 0;
  v_result jsonb;
begin
  select jobs_pipeline_dashboard() into v_result;

  -- 1. the open job appears with the correct estimated value (20% of 200000 = 40000)
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (
      select 1 from jsonb_array_elements(v_result -> 'open_jobs') j
      where j ->> 'title' = 'Open Job' and (j ->> 'estimated_value')::numeric = 40000
    ) then 'PASS 1: open job shows the correct estimated value'
    else 'FAIL 1: estimated value was wrong or missing' end);

  -- 2. the won job shows won=true and the real fee amount
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (
      select 1 from jsonb_array_elements(v_result -> 'closed_jobs') j
      where j ->> 'title' = 'Won Job' and (j ->> 'won')::boolean = true and (j ->> 'fee_amount')::numeric = 42000
    ) then 'PASS 2: won job shows won=true and the real fee'
    else 'FAIL 2: won job data was wrong' end);

  -- 3. the lost job shows won=false with no fee
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (
      select 1 from jsonb_array_elements(v_result -> 'closed_jobs') j
      where j ->> 'title' = 'Lost Job' and (j ->> 'won')::boolean = false and j -> 'fee_amount' = 'null'::jsonb
    ) then 'PASS 3: lost job shows won=false with no fee'
    else 'FAIL 3: lost job data was wrong' end);

  -- 4. totals reflect at least the seeded jobs (>= since other tests may have left data)
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (v_result -> 'totals' ->> 'won_count')::int >= 2
      and (v_result -> 'totals' ->> 'won_fee_total')::numeric >= 42000
    then 'PASS 4: totals include both won jobs'
    else format('FAIL 4: totals=%s', v_result -> 'totals') end);

  -- 5. a job marked 'filled' with no placement recorded still shows won=true, with no fee
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (
      select 1 from jsonb_array_elements(v_result -> 'closed_jobs') j
      where j ->> 'title' = 'Filled No Placement Job'
        and (j ->> 'won')::boolean = true
        and j -> 'fee_amount' = 'null'::jsonb
    ) then 'PASS 5: a filled job with no placement still shows won=true'
    else 'FAIL 5: won did not follow status alone' end);
end $$;

-- 6. an unauthorised caller is rejected
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
do $$
begin
  perform jobs_pipeline_dashboard();
  insert into test_results values (6, 'FAIL 6: an unauthorised caller received the jobs pipeline');
exception when others then
  insert into test_results values (6, 'PASS 6: jobs_pipeline_dashboard rejects an unauthorised caller');
end $$;

select * from test_results order by seq;

rollback;
