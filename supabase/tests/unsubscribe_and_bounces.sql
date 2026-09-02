-- Milestone 5 assertions. Wrapped in BEGIN/ROLLBACK.
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/unsubscribe_and_bounces.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
  v_email_id uuid;
  v_list_id uuid;
  v_template_id uuid;
  v_campaign_id uuid;
  v_recipient_id uuid;
  v_message_id uuid;
  v_consent_count int;
begin
  -- fixtures
  insert into email_addresses (email) values ('m5.a@example-seed.test') returning id into v_email_id;
  insert into communication_preferences (email_address_id, purpose, status, kind, source)
  values
    (v_email_id, 'blog', 'opted_in', 'ongoing', 'test_fixture'),
    (v_email_id, 'recruitment', 'opted_in', 'ongoing', 'test_fixture');

  insert into mailing_lists (name, purpose) values ('M5 test list', 'blog') returning id into v_list_id;
  insert into mailing_list_members (list_id, email_address_id) values (v_list_id, v_email_id);
  insert into email_templates (name, purpose, subject_template, html_template, text_template)
  values ('M5 template', 'blog', 'Subj', '<p>x</p>', 'x') returning id into v_template_id;
  insert into campaigns (name, purpose, template_id, list_id, status)
  values ('M5 blog campaign', 'blog', v_template_id, v_list_id, 'sending') returning id into v_campaign_id;
  insert into campaign_recipients (campaign_id, email_address_id, email_snapshot, status)
  values (v_campaign_id, v_email_id, 'm5.a@example-seed.test', 'queued') returning id into v_recipient_id;

  -- 1. unsubscribing from blog: creates suppression, opts out the
  -- preference, and cancels the queued campaign_recipients row
  perform record_unsubscribe(v_email_id, 'blog');

  v_seq := v_seq + 1;
  if exists (select 1 from suppression_entries where email_address_id = v_email_id and scope = 'blog' and active) then
    insert into test_results values (v_seq, 'PASS 1: unsubscribe creates an active blog suppression');
  else
    insert into test_results values (v_seq, 'FAIL 1: no active blog suppression created');
  end if;

  v_seq := v_seq + 1;
  if (select status from communication_preferences where email_address_id = v_email_id and purpose = 'blog') = 'opted_out' then
    insert into test_results values (v_seq, 'PASS 2: blog preference flipped to opted_out');
  else
    insert into test_results values (v_seq, 'FAIL 2: blog preference not opted_out');
  end if;

  v_seq := v_seq + 1;
  if (select status from campaign_recipients where id = v_recipient_id) = 'cancelled' then
    insert into test_results values (v_seq, 'PASS 3: the queued campaign_recipients row was cancelled');
  else
    insert into test_results values (v_seq, format('FAIL 3: expected cancelled, got %s', (select status from campaign_recipients where id = v_recipient_id)));
  end if;

  -- 4. recruitment is untouched by a blog-only unsubscribe
  v_seq := v_seq + 1;
  if (select status from communication_preferences where email_address_id = v_email_id and purpose = 'recruitment') = 'opted_in' then
    insert into test_results values (v_seq, 'PASS 4: recruitment preference untouched by blog unsubscribe');
  else
    insert into test_results values (v_seq, 'FAIL 4: recruitment preference was affected by a blog-scoped unsubscribe');
  end if;

  -- 5. calling record_unsubscribe again is a no-op, not an error, and
  -- does not create a second suppression row
  v_seq := v_seq + 1;
  begin
    perform record_unsubscribe(v_email_id, 'blog');
    if (select count(*) from suppression_entries where email_address_id = v_email_id and scope = 'blog') = 1 then
      insert into test_results values (v_seq, 'PASS 5: calling record_unsubscribe twice is idempotent (still exactly 1 row)');
    else
      insert into test_results values (v_seq, 'FAIL 5: duplicate suppression row created');
    end if;
  exception when others then
    insert into test_results values (v_seq, format('FAIL 5: repeat call raised an error: %s', sqlerrm));
  end;

  -- 6. all_marketing unsubscribe cancels/opts-out both blog and recruitment
  perform record_unsubscribe(v_email_id, 'all_marketing');

  v_seq := v_seq + 1;
  if (select status from communication_preferences where email_address_id = v_email_id and purpose = 'recruitment') = 'opted_out' then
    insert into test_results values (v_seq, 'PASS 6: all_marketing unsubscribe also opts out recruitment');
  else
    insert into test_results values (v_seq, 'FAIL 6: recruitment not opted out by all_marketing scope');
  end if;

  -- --- email event / bounce processing ---

  insert into email_messages (campaign_recipient_id, email_address_id, purpose, provider, provider_message_id, subject_snapshot, status, sent_at)
  values (v_recipient_id, v_email_id, 'blog', 'fake', 'msg-1', 'Subj', 'sent', now())
  returning id into v_message_id;

  -- 7. a hard bounce creates an all_email suppression
  perform process_email_event('fake', 'evt-hardbounce-1', 'hard_bounce', 'msg-1', '{}'::jsonb, now());

  v_seq := v_seq + 1;
  if exists (select 1 from suppression_entries where email_address_id = v_email_id and scope = 'all_email' and reason = 'hard_bounce' and active) then
    insert into test_results values (v_seq, 'PASS 7: hard bounce creates an all_email suppression');
  else
    insert into test_results values (v_seq, 'FAIL 7: hard bounce did not create an all_email suppression');
  end if;

  -- 8. the same provider_event_id delivered twice has no duplicate effect
  perform process_email_event('fake', 'evt-hardbounce-1', 'hard_bounce', 'msg-1', '{}'::jsonb, now());

  v_seq := v_seq + 1;
  if (select count(*) from email_events where provider = 'fake' and provider_event_id = 'evt-hardbounce-1') = 1
     and (select count(*) from suppression_entries where email_address_id = v_email_id and scope = 'all_email') = 1 then
    insert into test_results values (v_seq, 'PASS 8: duplicate webhook delivery has no duplicate effect');
  else
    insert into test_results values (v_seq, 'FAIL 8: duplicate webhook delivery caused a duplicate row');
  end if;

  -- 9. three soft bounces within 30 days on a fresh address triggers
  -- an all_email suppression on the third
  declare
    v_email2_id uuid;
    v_message2_id uuid;
  begin
    insert into email_addresses (email) values ('m5.b@example-seed.test') returning id into v_email2_id;
    insert into email_messages (email_address_id, purpose, provider, provider_message_id, subject_snapshot, status, sent_at)
    values (v_email2_id, 'blog', 'fake', 'msg-2', 'Subj', 'sent', now())
    returning id into v_message2_id;

    perform process_email_event('fake', 'evt-soft-1', 'soft_bounce', 'msg-2', '{}'::jsonb, now());
    perform process_email_event('fake', 'evt-soft-2', 'soft_bounce', 'msg-2', '{}'::jsonb, now());

    v_seq := v_seq + 1;
    if not exists (select 1 from suppression_entries where email_address_id = v_email2_id and scope = 'all_email') then
      insert into test_results values (v_seq, 'PASS 9: 2 soft bounces do not yet trigger suppression');
    else
      insert into test_results values (v_seq, 'FAIL 9: suppressed too early, after only 2 soft bounces');
    end if;

    perform process_email_event('fake', 'evt-soft-3', 'soft_bounce', 'msg-2', '{}'::jsonb, now());

    v_seq := v_seq + 1;
    if exists (select 1 from suppression_entries where email_address_id = v_email2_id and scope = 'all_email' and reason = 'soft_bounce_limit') then
      insert into test_results values (v_seq, 'PASS 10: the 3rd soft bounce within 30 days triggers suppression');
    else
      insert into test_results values (v_seq, 'FAIL 10: 3rd soft bounce did not trigger suppression');
    end if;
  end;
end $$;

select * from test_results order by seq;

rollback;
