-- Phase 1, Milestone 5: unsubscribe and bounce/complaint processing.
--
-- Deviation from the spec's literal record_unsubscribe(token, scope)
-- signature, disclosed here: verifying a signed token requires
-- UNSUBSCRIBE_TOKEN_SECRET, and this project's own architecture rule is
-- that secrets live only in provider environment settings, never in a
-- committed file - a SQL migration is exactly that. So token
-- verification happens in netlify/functions/unsubscribe.ts (where the
-- secret safely lives as a Netlify env var), which then calls this
-- function with the already-verified email identity. This function is
-- still SECURITY DEFINER with a narrow search path and still exposes
-- nothing about the recipient in its return value - it just receives an
-- authenticated identity as input rather than raw token bytes.

create function record_unsubscribe(
  p_email_address_id uuid,
  p_scope suppression_scope,
  p_source text default 'unsubscribe_link'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purposes permission_purpose[];
  v_purpose permission_purpose;
begin
  if p_scope not in ('blog', 'recruitment', 'all_marketing') then
    raise exception 'invalid unsubscribe scope: %', p_scope using errcode = 'P0001';
  end if;

  -- idempotent: a repeat click (or a retried request) must not error and
  -- must not create a second active suppression row
  insert into suppression_entries (email_address_id, scope, reason, source)
  values (p_email_address_id, p_scope, 'unsubscribe', p_source)
  on conflict (email_address_id, scope) where active do nothing;

  v_purposes := case when p_scope = 'all_marketing'
    then array['blog', 'recruitment']::permission_purpose[]
    else array[p_scope::text::permission_purpose]
  end;

  foreach v_purpose in array v_purposes loop
    update communication_preferences set status = 'opted_out', effective_at = now()
    where email_address_id = p_email_address_id and purpose = v_purpose;

    insert into consent_events (email_address_id, purpose, event_type, new_status, source)
    values (p_email_address_id, v_purpose, 'unsubscribe', 'opted_out', p_source);

    -- cancel anything already queued for this purpose that hasn't sent yet
    update campaign_recipients cr set status = 'cancelled', updated_at = now()
    from campaigns c
    where c.id = cr.campaign_id
      and c.purpose = v_purpose
      and cr.email_address_id = p_email_address_id
      and cr.status in ('pending', 'queued');
  end loop;
end;
$$;

-- Not granted to anon/authenticated: only netlify/functions/unsubscribe.ts
-- calls this, using the service role, after verifying the token itself.

-- ---------------------------------------------------------------------
-- process_email_event: the only way an email_events row is written.
-- Idempotent via the unique(provider, provider_event_id) constraint -
-- ON CONFLICT DO NOTHING means a duplicate webhook delivery (providers
-- routinely retry) has no duplicate effect, full stop, not just "no
-- duplicate suppression."
-- ---------------------------------------------------------------------
create function process_email_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_provider_message_id text,
  p_payload jsonb,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message email_messages%rowtype;
  v_event_id uuid;
  v_recent_soft_bounces int;
begin
  select * into v_message from email_messages
  where provider = p_provider and provider_message_id = p_provider_message_id;

  insert into email_events (email_message_id, provider, provider_event_id, event_type, payload, occurred_at)
  values (v_message.id, p_provider, p_provider_event_id, p_event_type, p_payload, p_occurred_at)
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event_id;

  -- already processed (this exact provider_event_id was seen before) -
  -- stop here so retried webhook deliveries have no duplicate effect
  if v_event_id is null then
    return;
  end if;

  if v_message.id is null then
    -- event for a message we have no record of - log only, nothing to act on
    return;
  end if;

  if p_event_type = 'delivered' then
    update email_messages set status = 'delivered' where id = v_message.id;

  elsif p_event_type = 'hard_bounce' then
    update email_messages set status = 'bounced' where id = v_message.id;
    insert into suppression_entries (email_address_id, scope, reason, source, provider_event_id)
    values (v_message.email_address_id, 'all_email', 'hard_bounce', p_provider, p_provider_event_id)
    on conflict (email_address_id, scope) where active do nothing;

  elsif p_event_type = 'complaint' then
    update email_messages set status = 'complained' where id = v_message.id;
    insert into suppression_entries (email_address_id, scope, reason, source, provider_event_id)
    values (v_message.email_address_id, 'all_email', 'complaint', p_provider, p_provider_event_id)
    on conflict (email_address_id, scope) where active do nothing;

  elsif p_event_type = 'soft_bounce' then
    -- suppress after 3 soft bounces within 30 days, per the spec
    select count(*) into v_recent_soft_bounces
    from email_events ee
    join email_messages em on em.id = ee.email_message_id
    where em.email_address_id = v_message.email_address_id
      and ee.event_type = 'soft_bounce'
      and ee.occurred_at >= now() - interval '30 days';

    if v_recent_soft_bounces >= 3 then
      insert into suppression_entries (email_address_id, scope, reason, source, provider_event_id)
      values (v_message.email_address_id, 'all_email', 'soft_bounce_limit', p_provider, p_provider_event_id)
      on conflict (email_address_id, scope) where active do nothing;
    end if;

  elsif p_event_type in ('open', 'click') then
    -- approximate signals only, per the spec - recorded above, no
    -- status change and never treated as proof of anything
    null;
  end if;
end;
$$;

-- Not granted to anon/authenticated: only netlify/functions/email-webhook.ts
-- calls this, using the service role, after verifying the provider's
-- webhook signature itself.
