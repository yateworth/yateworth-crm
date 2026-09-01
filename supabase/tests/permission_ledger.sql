-- Milestone 2 assertions: communication_preferences, suppression_entries
-- and can_send_email(). Wrapped in BEGIN/ROLLBACK — everything this file
-- does is undone at the end, so it's safe to run against a real project.
--
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/permission_ledger.sql
-- (requires SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN in the environment)

begin;

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_email_id uuid;
  v_result record;
  v_seq int := 0;
begin
  -- fixture: one throwaway email address, not linked to any person
  insert into email_addresses (email) values ('milestone2.test@example-seed.test')
  returning id into v_email_id;

  -- 1. No preference row at all -> not_opted_in
  v_seq := v_seq + 1;
  select * into v_result from can_send_email(v_email_id, 'report');
  insert into test_results values (v_seq,
    case when not v_result.allowed and v_result.reason = 'not_opted_in'
      then 'PASS 1: no preference row blocks send'
      else format('FAIL 1: expected (false, not_opted_in), got (%s, %s)', v_result.allowed, v_result.reason)
    end);

  -- 2. report opted_in, single_use, not yet fulfilled -> allowed
  insert into communication_preferences (email_address_id, purpose, status, kind, source)
  values (v_email_id, 'report', 'opted_in', 'single_use', 'test_fixture');

  v_seq := v_seq + 1;
  select * into v_result from can_send_email(v_email_id, 'report');
  insert into test_results values (v_seq,
    case when v_result.allowed and v_result.reason = 'allowed'
      then 'PASS 2: opted-in single-use report is allowed'
      else format('FAIL 2: expected (true, allowed), got (%s, %s)', v_result.allowed, v_result.reason)
    end);

  -- 3. blog purpose is untouched by the report preference (independent rows)
  v_seq := v_seq + 1;
  select * into v_result from can_send_email(v_email_id, 'blog');
  insert into test_results values (v_seq,
    case when not v_result.allowed and v_result.reason = 'not_opted_in'
      then 'PASS 3: report opt-in does not enable blog'
      else format('FAIL 3: expected blog=(false, not_opted_in), got (%s, %s)', v_result.allowed, v_result.reason)
    end);

  -- 4. mark the report fulfilled -> blocked as already_fulfilled
  update communication_preferences set fulfilled_at = now()
  where email_address_id = v_email_id and purpose = 'report';

  v_seq := v_seq + 1;
  select * into v_result from can_send_email(v_email_id, 'report');
  insert into test_results values (v_seq,
    case when not v_result.allowed and v_result.reason = 'already_fulfilled'
      then 'PASS 4: fulfilled single-use report cannot be re-sent'
      else format('FAIL 4: expected (false, already_fulfilled), got (%s, %s)', v_result.allowed, v_result.reason)
    end);

  -- 5. opt in to blog and recruitment (ongoing)
  insert into communication_preferences (email_address_id, purpose, status, kind, source)
  values
    (v_email_id, 'blog', 'opted_in', 'ongoing', 'test_fixture'),
    (v_email_id, 'recruitment', 'opted_in', 'ongoing', 'test_fixture');

  v_seq := v_seq + 1;
  select * into v_result from can_send_email(v_email_id, 'blog');
  insert into test_results values (v_seq,
    case when v_result.allowed
      then 'PASS 5: blog opt-in allowed'
      else format('FAIL 5: expected blog allowed, got (%s, %s)', v_result.allowed, v_result.reason)
    end);

  -- 6. blog opt-out does not silently change recruitment
  update communication_preferences set status = 'opted_out'
  where email_address_id = v_email_id and purpose = 'blog';

  v_seq := v_seq + 1;
  select * into v_result from can_send_email(v_email_id, 'blog');
  insert into test_results values (v_seq,
    case when not v_result.allowed
      then 'PASS 6a: blog opt-out blocks blog'
      else 'FAIL 6a: expected blog blocked after opt-out, got allowed'
    end);

  v_seq := v_seq + 1;
  select * into v_result from can_send_email(v_email_id, 'recruitment');
  insert into test_results values (v_seq,
    case when v_result.allowed
      then 'PASS 6b: blog opt-out does not touch recruitment preference'
      else format('FAIL 6b: expected recruitment still allowed, got (%s, %s)', v_result.allowed, v_result.reason)
    end);

  -- 7. "unsubscribe all marketing" blocks recruitment (and report, per spec)
  insert into suppression_entries (email_address_id, scope, reason, source)
  values (v_email_id, 'all_marketing', 'unsubscribe', 'test_fixture');

  v_seq := v_seq + 1;
  select * into v_result from can_send_email(v_email_id, 'recruitment');
  insert into test_results values (v_seq,
    case when not v_result.allowed and v_result.reason = 'all_marketing_suppressed'
      then 'PASS 7: all_marketing suppression blocks recruitment'
      else format('FAIL 7: expected all_marketing_suppressed, got (%s, %s)', v_result.allowed, v_result.reason)
    end);

  -- 8. hard bounce / complaint (all_email) blocks every purpose
  insert into suppression_entries (email_address_id, scope, reason, source)
  values (v_email_id, 'all_email', 'hard_bounce', 'test_fixture');

  v_seq := v_seq + 1;
  select * into v_result from can_send_email(v_email_id, 'recruitment');
  insert into test_results values (v_seq,
    case when not v_result.allowed and v_result.reason = 'all_email_suppressed'
      then 'PASS 8: all_email suppression blocks every purpose'
      else format('FAIL 8: expected all_email_suppressed, got (%s, %s)', v_result.allowed, v_result.reason)
    end);

  -- 9. normalise_email behaviour
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when normalise_email('  Test.User@EXAMPLE.com  ') = 'test.user@example.com'
      then 'PASS 9: normalise_email lowercases and trims'
      else 'FAIL 9: normalise_email did not lowercase/trim correctly'
    end);

  v_seq := v_seq + 1;
  begin
    perform normalise_email('not-an-email');
    insert into test_results values (v_seq, 'FAIL 10: normalise_email accepted an invalid address');
  exception when others then
    insert into test_results values (v_seq, 'PASS 10: normalise_email rejects an invalid address');
  end;
end $$;

select * from test_results order by seq;

rollback;
