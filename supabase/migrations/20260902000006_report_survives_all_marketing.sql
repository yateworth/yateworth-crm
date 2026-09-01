-- Decision (see README): an 'all_marketing' suppression should not block
-- a 'report' delivery. A report is a single thing the person explicitly
-- requested in its own separate action - it's transactional, not an
-- ongoing marketing send, so "unsubscribe from all marketing" shouldn't
-- also cancel a report they asked for. Only 'all_email' (hard bounce,
-- complaint - we can't or shouldn't reach this address at all) still
-- blocks every purpose including report.

create or replace function can_send_email(
  p_email_address_id uuid,
  p_purpose permission_purpose
)
returns table(allowed boolean, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pref communication_preferences%rowtype;
begin
  if not exists (select 1 from email_addresses where id = p_email_address_id) then
    return query select false, 'unknown_email';
    return;
  end if;

  if exists (
    select 1 from suppression_entries
    where email_address_id = p_email_address_id and scope = 'all_email' and active
  ) then
    return query select false, 'all_email_suppressed';
    return;
  end if;

  if p_purpose in ('blog', 'recruitment') and exists (
    select 1 from suppression_entries
    where email_address_id = p_email_address_id and scope = 'all_marketing' and active
  ) then
    return query select false, 'all_marketing_suppressed';
    return;
  end if;

  if exists (
    select 1 from suppression_entries
    where email_address_id = p_email_address_id
      and active
      and scope = (p_purpose::text::suppression_scope)
  ) then
    return query select false, 'purpose_suppressed';
    return;
  end if;

  select * into v_pref from communication_preferences
  where email_address_id = p_email_address_id and purpose = p_purpose;

  if not found or v_pref.status is distinct from 'opted_in' then
    return query select false, 'not_opted_in';
    return;
  end if;

  if v_pref.kind = 'single_use' and v_pref.fulfilled_at is not null then
    return query select false, 'already_fulfilled';
    return;
  end if;

  return query select true, 'allowed';
end;
$$;
