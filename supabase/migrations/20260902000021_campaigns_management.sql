-- Campaigns management: turning the Milestone 4 campaign backend (built
-- but never wired to a screen - see README "Still no UI for actually
-- *doing* anything with campaigns") into something marketing/admin can
-- actually use, plus a real fix for a gap this work surfaced:
-- claim_campaign_batch never checked a campaign's approval status, so
-- the spec's own decision order ("6. Does the campaign itself remain
-- approved and within rate limits?") was silently unenforced. Anyone
-- able to call the function could drain a campaign's queue whether or
-- not anyone had approved it.

-- ---------------------------------------------------------------------
-- sync_mailing_list_members: populates a list's membership from its
-- dynamic_filter, for the three segment kinds this pass supports.
-- Disclosed scope: a real segment builder (arbitrary AND/OR conditions)
-- is a lot more machinery than three list types need right now; these
-- three cover what was actually asked for (blog subscribers, active
-- candidates, a practice area) and the filter shape is simple JSON so a
-- fourth kind is a small addition later, not a rewrite.
--
-- Re-runnable: members this function itself added (added_source =
-- 'segment_sync') that no longer match are soft-removed (removed_at
-- set, never deleted - matches the table's existing history-preserving
-- design); a manually-added member (added_source anything else) is
-- never touched by a sync, even if the filter would also have matched
-- them.
-- ---------------------------------------------------------------------
create function sync_mailing_list_members(p_list_id uuid)
returns table(added bigint, removed bigint, total_active bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list mailing_lists%rowtype;
  v_kind text;
  v_matched_ids uuid[];
  v_added bigint := 0;
  v_removed bigint := 0;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

  select * into v_list from mailing_lists where id = p_list_id;
  if not found then
    raise exception 'mailing list not found: %', p_list_id using errcode = 'P0001';
  end if;

  if v_list.dynamic_filter is null then
    raise exception 'mailing list % is static (no dynamic_filter) - add members directly instead', p_list_id
      using errcode = 'P0001';
  end if;

  v_kind := v_list.dynamic_filter ->> 'kind';

  if v_kind = 'opted_in' then
    select coalesce(array_agg(cp.email_address_id), '{}') into v_matched_ids
    from communication_preferences cp
    where cp.purpose = (v_list.dynamic_filter ->> 'purpose')::permission_purpose
      and cp.status = 'opted_in';

  elsif v_kind = 'candidate_status' then
    select coalesce(array_agg(chosen.email_address_id), '{}') into v_matched_ids
    from (
      select distinct on (p.id) ea.id as email_address_id
      from people p
      join candidate_profiles cpf on cpf.person_id = p.id
      join email_addresses ea on ea.person_id = p.id
      where p.status = 'active'
        and cpf.candidate_status = (v_list.dynamic_filter ->> 'status')
      order by p.id, ea.is_primary desc, ea.created_at asc
    ) chosen;

  elsif v_kind = 'practice_area' then
    select coalesce(array_agg(chosen.email_address_id), '{}') into v_matched_ids
    from (
      select distinct on (p.id) ea.id as email_address_id
      from people p
      join candidate_profiles cpf on cpf.person_id = p.id
      join email_addresses ea on ea.person_id = p.id
      where p.status = 'active'
        and exists (
          select 1 from unnest(cpf.practice_areas) pa
          where lower(pa) = lower(v_list.dynamic_filter ->> 'value')
        )
      order by p.id, ea.is_primary desc, ea.created_at asc
    ) chosen;

  else
    raise exception 'unknown segment kind: %', v_kind using errcode = 'P0001';
  end if;

  with removed as (
    update mailing_list_members
    set removed_at = now()
    where list_id = p_list_id
      and added_source = 'segment_sync'
      and removed_at is null
      and not (email_address_id = any(v_matched_ids))
    returning 1
  )
  select count(*) into v_removed from removed;

  with upserted as (
    insert into mailing_list_members (list_id, email_address_id, added_source, added_at, removed_at)
    select p_list_id, eid, 'segment_sync', now(), null
    from unnest(v_matched_ids) as eid
    on conflict (list_id, email_address_id) do update
      set removed_at = null, added_source = 'segment_sync', added_at = now()
      where mailing_list_members.removed_at is not null
    returning 1
  )
  select count(*) into v_added from upserted;

  return query
    select v_added, v_removed,
      (select count(*) from mailing_list_members where list_id = p_list_id and removed_at is null);
end;
$$;

grant execute on function sync_mailing_list_members(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- claim_campaign_batch: re-created to add the missing approval gate.
-- A campaign must have approved_at set AND be in 'scheduled' or
-- 'sending' status before any recipient can be claimed - 'draft' and
-- 'paused' both now actually stop sending, not just look like they do.
-- First successful claim on a 'scheduled' campaign flips it to
-- 'sending' and stamps started_at, so the status column reflects
-- reality instead of needing a separate manual step.
-- ---------------------------------------------------------------------
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

grant execute on function claim_campaign_batch(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- approve_campaign: the only way approved_by/approved_at get set -
-- pulled into a function (rather than a plain client-side update, which
-- campaigns_marketing_admin_all would otherwise permit) so "approved"
-- always means a specific admin, at a specific time, deliberately - not
-- a field a form could set by accident. Admin-only: marketing creates
-- and previews campaigns, approval is a separate authority per the
-- spec's own step 5 ("Require an authorised approval before
-- scheduling").
-- ---------------------------------------------------------------------
create function approve_campaign(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_app_role() is null or current_app_role() <> 'admin' then
    raise exception 'not authorised';
  end if;

  update campaigns
  set approved_by = auth.uid(), approved_at = now(), status = 'scheduled'
  where id = p_campaign_id and status = 'draft';

  if not found then
    raise exception 'campaign not found or not in draft status: %', p_campaign_id using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function approve_campaign(uuid) to authenticated;
