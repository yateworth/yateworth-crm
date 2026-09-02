-- record_email_sent: the only way an email_messages row is written.
-- Called after a real (or fake) provider send succeeds, so the
-- provider_message_id is always genuine, never guessed at by a client.
create function record_email_sent(
  p_campaign_recipient_id uuid,
  p_provider text,
  p_provider_message_id text,
  p_subject_snapshot text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient campaign_recipients%rowtype;
  v_message_id uuid;
begin
  select * into v_recipient from campaign_recipients where id = p_campaign_recipient_id;
  if not found then
    raise exception 'campaign recipient not found';
  end if;

  insert into email_messages (campaign_recipient_id, email_address_id, purpose, provider, provider_message_id, subject_snapshot, status, sent_at)
  select p_campaign_recipient_id,
         v_recipient.email_address_id,
         c.purpose,
         p_provider,
         p_provider_message_id,
         p_subject_snapshot,
         'sent',
         now()
  from campaigns c where c.id = v_recipient.campaign_id
  returning id into v_message_id;

  update campaign_recipients set status = 'sent', updated_at = now()
  where id = p_campaign_recipient_id;

  return v_message_id;
end;
$$;

grant execute on function record_email_sent(uuid, text, text, text) to authenticated;
