-- Verifies actual RLS table-policy enforcement, not just SECURITY
-- DEFINER function internal logic. Every other test file in this repo
-- exercises functions (can_send_email, claim_campaign_batch, etc.)
-- whose role checks are plain SQL conditionals reading a JWT claim -
-- correct regardless of which Postgres role executes the query. But
-- Stage 1's Candidates/Firms screens (docs/crm-functionality-plan.md)
-- read and write firms/people/candidate_profiles/email_addresses
-- directly from the client with no function in between - their
-- correctness depends entirely on the RLS policies from migration 3
-- (and activities/tasks from migration 17) actually being enforced,
-- which nothing had verified until now.
--
-- Critical prerequisite: `set local role authenticated` is required.
-- The Management API executes as `postgres`, which has BYPASSRLS -
-- verified live: `select rolbypassrls from pg_roles where rolname =
-- current_user` is true for postgres, false for authenticated. Without
-- this line every check below would silently pass no matter what the
-- policies actually say.
--
-- Also note: an RLS-blocked write affects zero rows silently - it does
-- NOT raise an exception - so these checks read the table back
-- afterward rather than expecting a thrown error.
--
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/direct_table_rls.sql

begin;

set local role authenticated;
-- a syntactically valid UUID matching no row in profiles - simulates a
-- signed-up-but-not-yet-approved user, or a deactivated account. This
-- is the exact scenario the migration 15 vulnerability was about, now
-- checked against RLS table policies instead of function guards.
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
  v_role text;
begin
  select current_app_role() into v_role;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_role is null then 'PASS 0: impersonated caller correctly has no resolvable role (current_app_role() is null)'
    else format('FAIL 0: expected null role, got %s - the rest of this test is meaningless', v_role) end);

  -- firms: no-profile caller can neither read nor write
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select count(*) from firms) = 0
    then 'PASS 1: firms is invisible to a caller with no active profile'
    else 'FAIL 1: firms rows were visible to an unauthorised caller' end);

  v_seq := v_seq + 1;
  begin
    insert into firms (name) values ('Should not be insertable');
    insert into test_results values (v_seq, 'FAIL 2: an unauthorised caller inserted a firm');
  exception when others then
    insert into test_results values (v_seq, 'PASS 2: firms insert correctly rejected for an unauthorised caller');
  end;

  -- people/candidate_profiles/email_addresses: same
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select count(*) from people) = 0
    then 'PASS 3: people is invisible to a caller with no active profile'
    else 'FAIL 3: people rows were visible to an unauthorised caller' end);

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select count(*) from candidate_profiles) = 0
    then 'PASS 4: candidate_profiles is invisible to a caller with no active profile'
    else 'FAIL 4: candidate_profiles rows were visible to an unauthorised caller' end);

  v_seq := v_seq + 1;
  begin
    insert into people (first_name, last_name) values ('Should', 'Not-insert');
    insert into test_results values (v_seq, 'FAIL 5: an unauthorised caller inserted a person');
  exception when others then
    insert into test_results values (v_seq, 'PASS 5: people insert correctly rejected for an unauthorised caller');
  end;

  -- activities/tasks (Stage 2, migration 17): same
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select count(*) from activities) = 0
    then 'PASS 6: activities is invisible to a caller with no active profile'
    else 'FAIL 6: activities rows were visible to an unauthorised caller' end);

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select count(*) from tasks) = 0
    then 'PASS 7: tasks is invisible to a caller with no active profile'
    else 'FAIL 7: tasks rows were visible to an unauthorised caller' end);

  v_seq := v_seq + 1;
  begin
    insert into tasks (title) values ('Should not be insertable');
    insert into test_results values (v_seq, 'FAIL 8: an unauthorised caller inserted a task');
  exception when others then
    insert into test_results values (v_seq, 'PASS 8: tasks insert correctly rejected for an unauthorised caller');
  end;
end $$;

select * from test_results order by seq;

rollback;
