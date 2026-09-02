-- Milestone 4 assertions. Wrapped in BEGIN/ROLLBACK.
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/campaigns.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
  v_email_a uuid;
  v_email_b uuid;
  v_email_c uuid;
  v_list_id uuid;
  v_template_id uuid;
  v_campaign_id uuid;
  v_claimed record;
  v_claimed_count int;
  v_second_claim_count int;
  v_pending_count int;
  v_suppressed_count int;
begin
  -- fixtures: three opted-in recipients on a fresh list
  insert into email_addresses (email) values ('m4.a@example-seed.test') returning id into v_email_a;
  insert into email_addresses (email) values ('m4.b@example-seed.test') returning id into v_email_b;
  insert into email_addresses (email) values ('m4.c@example-seed.test') returning id into v_email_c;

  insert into communication_preferences (email_address_id, purpose, status, kind, source)
  values
    (v_email_a, 'blog', 'opted_in', 'ongoing', 'test_fixture'),
    (v_email_b, 'blog', 'opted_in', 'ongoing', 'test_fixture'),
    (v_email_c, 'blog', 'opted_in', 'ongoing', 'test_fixture');

  insert into mailing_lists (name, purpose) values ('Milestone 4 test list', 'blog') returning id into v_list_id;
  insert into mailing_list_members (list_id, email_address_id)
  values (v_list_id, v_email_a), (v_list_id, v_email_b), (v_list_id, v_email_c);

  insert into email_templates (name, purpose, subject_template, html_template, text_template)
  values ('Test newsletter', 'blog', 'Subject', '<p>Body</p>', 'Body')
  returning id into v_template_id;

  insert into campaigns (name, purpose, template_id, list_id, status)
  values ('Milestone 4 test campaign', 'blog', v_template_id, v_list_id, 'draft')
  returning id into v_campaign_id;

  -- 1. snapshot generation: all three should be eligible right now
  perform generate_campaign_recipients(v_campaign_id);

  v_seq := v_seq + 1;
  select count(*) into v_pending_count from campaign_recipients
  where campaign_id = v_campaign_id and status = 'pending';
  insert into test_results values (v_seq,
    case when v_pending_count = 3
      then 'PASS 1: all 3 opted-in recipients snapshot as pending/eligible'
      else format('FAIL 1: expected 3 pending, got %s', v_pending_count)
    end);

  -- 2. recipient B opts out AFTER the snapshot but BEFORE the send -
  -- claim_campaign_batch must re-check and catch this, not trust the
  -- frozen eligibility_snapshot
  update communication_preferences set status = 'opted_out'
  where email_address_id = v_email_b and purpose = 'blog';

  v_claimed_count := 0;
  for v_claimed in select * from claim_campaign_batch(v_campaign_id, 10) loop
    v_claimed_count := v_claimed_count + 1;
    if v_claimed.email_address_id = v_email_b then
      insert into test_results values (999, 'FAIL 2: opted-out recipient B was claimed for sending');
    end if;
  end loop;

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_claimed_count = 2
      then 'PASS 2: only the 2 still-eligible recipients were claimed'
      else format('FAIL 2: expected 2 claimed, got %s', v_claimed_count)
    end);

  v_seq := v_seq + 1;
  select count(*) into v_suppressed_count from campaign_recipients
  where campaign_id = v_campaign_id and email_address_id = v_email_b and status = 'suppressed';
  insert into test_results values (v_seq,
    case when v_suppressed_count = 1
      then 'PASS 3: recipient B was moved to suppressed, not silently skipped'
      else 'FAIL 3: recipient B was not marked suppressed'
    end);

  -- 4. no double-claim: everyone eligible is now 'queued', so a second
  -- claim call must return nothing
  v_seq := v_seq + 1;
  select count(*) into v_second_claim_count from claim_campaign_batch(v_campaign_id, 10);
  insert into test_results values (v_seq,
    case when v_second_claim_count = 0
      then 'PASS 4: a second claim call returns nothing (no double-claim)'
      else format('FAIL 4: second claim call returned %s rows', v_second_claim_count)
    end);

  -- 5. confirm final state: 2 queued, 1 suppressed, 0 still pending
  v_seq := v_seq + 1;
  if (select count(*) from campaign_recipients where campaign_id = v_campaign_id and status = 'queued') = 2
     and (select count(*) from campaign_recipients where campaign_id = v_campaign_id and status = 'pending') = 0 then
    insert into test_results values (v_seq, 'PASS 5: final recipient states are correct (2 queued, 0 pending)');
  else
    insert into test_results values (v_seq, 'FAIL 5: unexpected final recipient state distribution');
  end if;

  -- 6. record_email_sent transitions a queued recipient to sent and
  -- writes a genuine email_messages row
  v_seq := v_seq + 1;
  declare
    v_recipient_id uuid;
    v_message_id uuid;
  begin
    select id into v_recipient_id from campaign_recipients
    where campaign_id = v_campaign_id and status = 'queued' limit 1;

    v_message_id := record_email_sent(v_recipient_id, 'fake', 'fake_test_message_id', 'Test subject');

    if (select status from campaign_recipients where id = v_recipient_id) = 'sent'
       and exists (select 1 from email_messages where id = v_message_id and provider_message_id = 'fake_test_message_id') then
      insert into test_results values (v_seq, 'PASS 6: record_email_sent marks recipient sent and logs the message');
    else
      insert into test_results values (v_seq, 'FAIL 6: record_email_sent did not update state correctly');
    end if;
  end;
end $$;

select * from test_results order by seq;

rollback;
