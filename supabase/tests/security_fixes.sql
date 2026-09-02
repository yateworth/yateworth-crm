-- Security fixes assertions (migration 31).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/security_fixes.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
grant select, insert on test_results to authenticated;

do $$
declare
  v_firm_id uuid;
  v_template_id uuid;
  v_list_id uuid;
  v_campaign_id uuid;
begin
  insert into firms (name) values ('Security Fix Test Firm') returning id into v_firm_id;
  insert into email_templates (name, purpose, subject_template, html_template, text_template)
  values ('Security fix test template', 'recruitment', 'Hi', '<p>Hi</p>', 'Hi')
  returning id into v_template_id;
  insert into mailing_lists (name, purpose) values ('Security fix test list', 'recruitment') returning id into v_list_id;
  insert into campaigns (name, purpose, template_id, list_id, status, approved_at)
  values ('Security fix test campaign', 'recruitment', v_template_id, v_list_id, 'scheduled', now())
  returning id into v_campaign_id;
  insert into test_results (seq, result) values (0, v_campaign_id::text);
end $$;

set local role authenticated;

-- 1. an unrecognised (no-profile) caller cannot claim a batch, even
-- though the campaign itself is fully approved and scheduled — this is
-- exactly the regression: the approval gate alone let this through.
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
do $$
declare
  v_campaign_id uuid;
begin
  select result::uuid into v_campaign_id from test_results where seq = 0;
  perform claim_campaign_batch(v_campaign_id);
  insert into test_results values (1, 'FAIL 1: an unauthorised caller claimed a batch from an approved campaign');
exception when others then
  insert into test_results values (1, 'PASS 1: claim_campaign_batch rejects an unauthorised caller even when approved');
end $$;

-- 2. select_segment_email_ids can no longer be called directly by any
-- client role. Checks specifically for insufficient_privilege (42501),
-- not just any error, since this function has no internal role check
-- of its own - rejection must come from the GRANT revoke, not a raise.
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);
do $$
begin
  perform select_segment_email_ids('{}'::jsonb);
  insert into test_results values (2, 'FAIL 2: select_segment_email_ids was callable directly by an authenticated client');
exception when insufficient_privilege then
  insert into test_results values (2, 'PASS 2: select_segment_email_ids is no longer directly callable');
end $$;

-- 3. the admin/marketing wrapper functions still work despite the revoke above
do $$
declare
  v_count bigint;
begin
  select compute_segment_count('{}'::jsonb) into v_count;
  insert into test_results values (3,
    case when v_count is not null then 'PASS 3: compute_segment_count still works through the wrapper'
    else 'FAIL 3: compute_segment_count broke' end);
end $$;

-- 4. apply_permission_preference can no longer be called directly by
-- an authenticated client (consent-forgery gap). Checks specifically
-- for insufficient_privilege (42501), not just any error, so an
-- unrelated business-logic exception can't masquerade as a pass.
do $$
declare
  v_email_id uuid;
begin
  select id into v_email_id from email_addresses limit 1;
  perform apply_permission_preference(v_email_id, 'recruitment', 'ongoing', 'test-forgery', '{}'::jsonb);
  insert into test_results values (4, 'FAIL 4: apply_permission_preference was callable directly by an authenticated client');
exception when insufficient_privilege then
  insert into test_results values (4, 'PASS 4: apply_permission_preference is no longer directly callable');
end $$;

-- 5. can_send_email: authenticated access is intentionally kept (staff
-- eligibility-preview UIs use it) - confirm it still works for them
do $$
declare
  v_email_id uuid;
  v_result record;
begin
  select id into v_email_id from email_addresses limit 1;
  select * into v_result from can_send_email(v_email_id, 'recruitment');
  insert into test_results values (5,
    case when v_result.allowed is not null then 'PASS 5: can_send_email still works for authenticated staff UIs'
    else 'FAIL 5: can_send_email broke for authenticated callers' end);
end $$;

-- 6. process_email_event can no longer be called directly by an
-- authenticated client (webhook-forgery gap)
do $$
begin
  perform process_email_event('test-provider', 'test-event-id', 'bounced', 'test-message-id', '{}'::jsonb, now());
  insert into test_results values (6, 'FAIL 6: process_email_event was callable directly by an authenticated client');
exception when insufficient_privilege then
  insert into test_results values (6, 'PASS 6: process_email_event is no longer directly callable');
end $$;

-- 7. record_unsubscribe can no longer be called directly by an
-- authenticated client, bypassing the signed-token model
do $$
declare
  v_email_id uuid;
begin
  select id into v_email_id from email_addresses limit 1;
  perform record_unsubscribe(v_email_id, 'all_email', 'test-forgery');
  insert into test_results values (7, 'FAIL 7: record_unsubscribe was callable directly by an authenticated client');
exception when insufficient_privilege then
  insert into test_results values (7, 'PASS 7: record_unsubscribe is no longer directly callable');
end $$;

-- 8. the legitimate wrapper (submit_permission_request, the anonymous-
-- safe entry point used by the real landing-page forms) still works
-- through the revoke on apply_permission_preference above
do $$
begin
  perform submit_permission_request('security-fix-test@example.com', false, false, true, null, 'landing-page', 'v1');
  insert into test_results values (8, 'PASS 8: submit_permission_request still works through apply_permission_preference');
exception when others then
  insert into test_results values (8, 'FAIL 8: submit_permission_request broke - ' || sqlerrm);
end $$;

select * from test_results where seq > 0 order by seq;

rollback;
