-- Insights dashboard assertions (migration 25).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/insights_dashboard.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
grant select, insert on test_results to authenticated;

do $$
declare
  v_stale_person_id uuid;
  v_fresh_person_id uuid;
  v_firm_id uuid;
  v_stale_job_id uuid;
  v_covered_job_id uuid;
  v_candidate_id uuid;
begin
  -- a candidate never contacted - should be flagged stale
  insert into people (first_name, last_name, status) values ('Stale', 'Contact', 'active')
  returning id into v_stale_person_id;
  insert into candidate_profiles (person_id, candidate_status) values (v_stale_person_id, 'active');

  -- a candidate contacted moments ago - should not be flagged
  insert into people (first_name, last_name, status) values ('Fresh', 'Contact', 'active')
  returning id into v_fresh_person_id;
  insert into candidate_profiles (person_id, candidate_status, last_contacted_at) values (v_fresh_person_id, 'active', now());

  insert into firms (name, relationship_stage, created_at) values ('Insights Test Firm', 'terms_signed', now() - interval '90 days')
  returning id into v_firm_id;

  -- a job open 90 days with zero submissions - should be flagged stale
  insert into jobs (firm_id, title, status, opened_at) values (v_firm_id, 'Stale Job', 'open', now() - interval '90 days')
  returning id into v_stale_job_id;

  -- a job open 90 days but with a submission - should not be flagged
  insert into jobs (firm_id, title, status, opened_at) values (v_firm_id, 'Covered Job', 'open', now() - interval '90 days')
  returning id into v_covered_job_id;
  insert into people (first_name, last_name, status) values ('Some', 'Candidate', 'active') returning id into v_candidate_id;
  insert into candidate_profiles (person_id, candidate_status) values (v_candidate_id, 'active');
  insert into submissions (job_id, candidate_id) values (v_covered_job_id, v_candidate_id);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

do $$
declare
  v_seq int := 0;
  v_result jsonb;
begin
  select insights_dashboard() into v_result;

  -- 1. the never-contacted candidate is flagged
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (
      select 1 from jsonb_array_elements(v_result -> 'stale_candidates') c where c ->> 'name' = 'Stale Contact'
    ) then 'PASS 1: a never-contacted candidate is flagged stale'
    else 'FAIL 1: the never-contacted candidate was not flagged' end);

  -- 2. the recently-contacted candidate is not flagged
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when not exists (
      select 1 from jsonb_array_elements(v_result -> 'stale_candidates') c where c ->> 'name' = 'Fresh Contact'
    ) then 'PASS 2: a recently-contacted candidate is not flagged'
    else 'FAIL 2: the recently-contacted candidate was incorrectly flagged' end);

  -- 3. the uncovered stale job is flagged
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (
      select 1 from jsonb_array_elements(v_result -> 'stale_jobs') j where j ->> 'title' = 'Stale Job'
    ) then 'PASS 3: a long-open job with no submissions is flagged'
    else 'FAIL 3: the stale job was not flagged' end);

  -- 4. the job with a submission is not flagged, even though it's just as old
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when not exists (
      select 1 from jsonb_array_elements(v_result -> 'stale_jobs') j where j ->> 'title' = 'Covered Job'
    ) then 'PASS 4: a long-open job with a submission is not flagged'
    else 'FAIL 4: the covered job was incorrectly flagged' end);

  -- 5. the quiet firm relationship is flagged
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (
      select 1 from jsonb_array_elements(v_result -> 'dormant_firms') f where f ->> 'name' = 'Insights Test Firm'
    ) then 'PASS 5: a quiet firm relationship is flagged'
    else 'FAIL 5: the dormant-looking firm was not flagged' end);
end $$;

-- 6. an unauthorised caller is rejected
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
do $$
begin
  perform insights_dashboard();
  insert into test_results values (6, 'FAIL 6: an unauthorised caller received insights');
exception when others then
  insert into test_results values (6, 'PASS 6: insights_dashboard rejects an unauthorised caller');
end $$;

select * from test_results order by seq;

rollback;
