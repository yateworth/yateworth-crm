-- Two real gaps found during a full-codebase review (see README):
--
-- 1. claim_campaign_batch lost its admin/marketing role check. Migration
--    15 added it after discovering "any authenticated user, regardless
--    of profiles.role or profiles.active, could claim and 'send' a
--    campaign batch". Migration 21's `create or replace` to add the
--    approval-status gate silently dropped that check entirely - the
--    function has had NO role check at all since. Confirmed live: any
--    signed-in user (any role, even an unapproved/inactive profile)
--    could call this directly, bypassing send-campaign-batch.ts's own
--    check, and queue a campaign's recipients for sending.
--
-- 2. select_segment_email_ids was designed as an internal-only helper
--    (see its own comment in migration 23: "not granted to any client
--    role directly... only called from the two SECURITY DEFINER
--    functions below, which do the role check") but was never actually
--    revoked from PUBLIC, which Postgres grants EXECUTE to by default
--    on every new function. Confirmed live: anon and authenticated both
--    had EXECUTE on it, meaning anyone - including an unauthenticated
--    caller - could call it directly and enumerate email_address_id
--    values matching arbitrary segment filters, with no role check at
--    all, since the function itself has none by design (it relies
--    entirely on its callers to gate access). Revoking PUBLIC's grant
--    doesn't affect compute_segment_count/sync_mailing_list_members/
--    create_ad_hoc_campaign, which call it as their own (SECURITY
--    DEFINER) owner, not as the original caller.

create or replace function claim_campaign_batch(p_campaign_id uuid, p_batch_size int default 50)
returns setof campaign_recipients
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign campaigns%rowtype;
  v_row campaign_recipients%rowtype;
  v_eligibility record;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

  select * into v_campaign from campaigns where id = p_campaign_id;
  if not found then
    raise exception 'campaign not found';
  end if;

  if v_campaign.approved_at is null or v_campaign.status not in ('scheduled', 'sending') then
    raise exception 'campaign % is not approved and scheduled for sending', p_campaign_id
      using errcode = 'P0001';
  end if;

  if v_campaign.status = 'scheduled' then
    update campaigns set status = 'sending', started_at = coalesce(started_at, now())
      where id = p_campaign_id;
  end if;

  for v_row in
    select cr.* from campaign_recipients cr
    where cr.campaign_id = p_campaign_id and cr.status = 'pending'
    order by cr.created_at
    limit p_batch_size
    for update skip locked
  loop
    select * into v_eligibility from can_send_email(v_row.email_address_id, v_campaign.purpose);

    if v_eligibility.allowed then
      update campaign_recipients
        set status = 'queued', updated_at = now()
        where id = v_row.id;
      v_row.status := 'queued';
      return next v_row;
    else
      update campaign_recipients
        set status = 'suppressed', suppression_reason = v_eligibility.reason, updated_at = now()
        where id = v_row.id;
    end if;
  end loop;
  return;
end;
$$;

-- Revoking from PUBLIC alone is not enough on Supabase: every new
-- function in the public schema also gets an explicit EXECUTE grant to
-- anon/authenticated/service_role via the project's own default
-- privileges, separate from (and in addition to) the implicit PUBLIC
-- grant - confirmed live via information_schema.routine_privileges.
-- service_role is left untouched (server-side only, not reachable from
-- a browser session).
revoke execute on function select_segment_email_ids(jsonb) from public, anon, authenticated;

-- 3-6. A systematic audit of every SECURITY DEFINER function in public
-- (via information_schema.routine_privileges / has_function_privilege)
-- turned up four more functions whose own code comments already claimed
-- to be locked down, but which the same Supabase default-privilege gap
-- above left reachable directly by client roles:
--
-- 3. apply_permission_preference has no internal role check at all - it
--    relies entirely on being called from submit_permission_request (an
--    anonymous-safe wrapper that validates its own inputs) and from
--    staff UIs. Direct access would let anyone forge an "opted in"
--    consent record for an arbitrary email address with a fabricated
--    source/evidence payload - consent forgery. Revoked from both anon
--    and authenticated; only service_role and the SECURITY DEFINER
--    wrapper functions that call it as their own owner are unaffected.
--
-- 4. can_send_email is intentionally callable by any authenticated
--    staff role, per its own comment, so recruiter/marketing UIs can
--    preview send eligibility - that grant is kept. But anon also had
--    EXECUTE, which serves no legitimate purpose (no anonymous UI calls
--    this) and just lets an unauthenticated caller probe suppression
--    state for arbitrary email addresses. Revoked from anon only.
--
-- 5. process_email_event is the webhook-ingestion function, meant to be
--    called only by the provider-webhook Netlify function under
--    service_role. Direct client access would let anyone forge bounce/
--    complaint/unsubscribe events for arbitrary provider_message_ids,
--    corrupting suppression state - webhook forgery. Revoked from both
--    anon and authenticated.
--
-- 6. record_unsubscribe is meant to be reached only via a signed,
--    single-use unsubscribe token verified by the unsubscribe Netlify
--    function under service_role. Direct client access would let
--    anyone unsubscribe an arbitrary email address without ever
--    presenting a valid token, defeating the signed-token model
--    entirely. Revoked from both anon and authenticated.
-- As with select_segment_email_ids above, PUBLIC itself (not just
-- anon/authenticated) must be revoked - Postgres resolves privileges
-- cumulatively, so a leftover PUBLIC grant still lets anon/authenticated
-- through even after their own explicit grants are revoked. Confirmed
-- live: revoking only anon/authenticated from process_email_event left
-- it directly callable by an authenticated client via the PUBLIC grant.
revoke execute on function apply_permission_preference(uuid, permission_purpose, permission_kind, text, jsonb) from public, anon, authenticated;
revoke execute on function can_send_email(uuid, permission_purpose) from public, anon;
revoke execute on function process_email_event(text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function record_unsubscribe(uuid, suppression_scope, text) from public, anon, authenticated;
