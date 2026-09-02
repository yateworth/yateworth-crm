-- Campaigns management assertions (migration 21).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/campaigns_management.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
create temporary table test_ids (email_id uuid, list_id uuid, template_id uuid) on commit drop;
grant select, insert on test_results to authenticated;
grant select on test_ids to authenticated;

-- Setup runs before the role switch below: communication_preferences and
-- email_addresses have no insert policy for any client role at all
-- (writes go through submit_permission_request/create_candidate etc in
-- real use), so this test seeds them directly while still running with
-- full privileges, then switches to 'authenticated' only for the actual
-- assertions against the functions under test.
do $$
declare
  v_email_id uuid;
  v_list_id uuid;
  v_template_id uuid;
begin
  insert into email_addresses (email) values ('campaign-test@example.com')
  returning id into v_email_id;
  insert into communication_preferences (email_address_id, purpose, status, kind, source)
  values (v_email_id, 'blog', 'opted_in', 'ongoing', 'test setup');

  insert into mailing_lists (name, purpose, dynamic_filter)
  values ('Test blog subscribers', 'blog', jsonb_build_object('kind', 'opted_in', 'purpose', 'blog'))
  returning id into v_list_id;

  insert into email_templates (name, purpose, subject_template, html_template, text_template)
  values ('Test template', 'blog', 'Hello', '<p>Hi</p>', 'Hi')
  returning id into v_template_id;

  insert into test_ids (email_id, list_id, template_id) values (v_email_id, v_list_id, v_template_id);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

do $$
declare
  v_seq int := 0;
  v_list_id uuid;
  v_template_id uuid;
  v_campaign_id uuid;
  v_added bigint;
  v_removed bigint;
  v_total bigint;
  v_recipient_status recipient_status;
  v_campaign_status campaign_status;
begin
  select list_id, template_id into v_list_id, v_template_id from test_ids;

  -- 1. sync_mailing_list_members matches the opted-in email
  select added, removed, total_active into v_added, v_removed, v_total
  from sync_mailing_list_members(v_list_id);
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_added = 1 and v_total = 1 then 'PASS 1: sync_mailing_list_members matches the opted-in email'
    else format('FAIL 1: added=%s total=%s', v_added, v_total) end);

  -- 2. re-running the sync is a no-op (already matched, not re-added)
  select added, removed, total_active into v_added, v_removed, v_total
  from sync_mailing_list_members(v_list_id);
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_added = 0 and v_removed = 0 and v_total = 1 then 'PASS 2: re-sync is idempotent'
    else format('FAIL 2: added=%s removed=%s total=%s', v_added, v_removed, v_total) end);

  -- 3. an unknown segment kind is rejected
  v_seq := v_seq + 1;
  begin
    update mailing_lists set dynamic_filter = jsonb_build_object('kind', 'not_a_real_kind') where id = v_list_id;
    perform sync_mailing_list_members(v_list_id);
    insert into test_results values (v_seq, 'FAIL 3: an unknown segment kind was accepted');
  exception when others then
    insert into test_results values (v_seq, 'PASS 3: an unknown segment kind is rejected');
  end;
  update mailing_lists set dynamic_filter = jsonb_build_object('kind', 'opted_in', 'purpose', 'blog') where id = v_list_id;

  -- 4. an unauthorised caller cannot sync a list
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  v_seq := v_seq + 1;
  begin
    perform sync_mailing_list_members(v_list_id);
    insert into test_results values (v_seq, 'FAIL 4: an unauthorised caller synced a list');
  exception when others then
    insert into test_results values (v_seq, 'PASS 4: sync_mailing_list_members rejects an unauthorised caller');
  end;
  perform set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

  -- set up a draft campaign against the list + template
  insert into campaigns (name, purpose, template_id, list_id, status, created_by)
  values ('Test campaign', 'blog', v_template_id, v_list_id, 'draft', auth.uid())
  returning id into v_campaign_id;
  perform generate_campaign_recipients(v_campaign_id);

  -- 5. claim_campaign_batch refuses an unapproved (draft) campaign
  v_seq := v_seq + 1;
  begin
    perform claim_campaign_batch(v_campaign_id);
    insert into test_results values (v_seq, 'FAIL 5: an unapproved campaign was claimable');
  exception when others then
    insert into test_results values (v_seq, 'PASS 5: claim_campaign_batch refuses an unapproved campaign');
  end;

  -- 6. an unauthorised caller cannot approve a campaign
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  v_seq := v_seq + 1;
  begin
    perform approve_campaign(v_campaign_id);
    insert into test_results values (v_seq, 'FAIL 6: an unauthorised caller approved a campaign');
  exception when others then
    insert into test_results values (v_seq, 'PASS 6: approve_campaign rejects an unauthorised caller');
  end;
  perform set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

  -- 7. approving flips it to scheduled, and claiming now works and flips it to sending
  perform approve_campaign(v_campaign_id);
  perform claim_campaign_batch(v_campaign_id);

  select status into v_recipient_status from campaign_recipients where campaign_id = v_campaign_id;
  select status into v_campaign_status from campaigns where id = v_campaign_id;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_recipient_status = 'queued' and v_campaign_status = 'sending'
    then 'PASS 7: approving then claiming queues the recipient and marks the campaign sending'
    else format('FAIL 7: recipient status=%s campaign status=%s', v_recipient_status, v_campaign_status) end);

  -- 8. approve_campaign refuses a campaign that isn't in draft status any more
  v_seq := v_seq + 1;
  begin
    perform approve_campaign(v_campaign_id);
    insert into test_results values (v_seq, 'FAIL 8: a non-draft campaign was re-approved');
  exception when others then
    insert into test_results values (v_seq, 'PASS 8: approve_campaign refuses a non-draft campaign');
  end;
end $$;

select * from test_results order by seq;

rollback;
