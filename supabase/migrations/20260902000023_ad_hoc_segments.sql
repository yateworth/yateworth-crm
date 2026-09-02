-- Replaces migration 21's three single-condition segment "kinds" with one
-- compound filter, and adds a way to send against it directly - the user
-- was explicit that naming and saving a list first is not the workflow
-- she wants: "I don't want to manually create lists, I want to basically
-- be able to send an email based on whether the candidate or firm
-- contact or practice area and PQE - like filterable." Nothing has used
-- the old kind-based shape in production yet, so this replaces it
-- outright rather than versioning both.
--
-- Filter shape (all keys optional, combined with AND):
--   contact_type: 'candidate' | 'firm_contact' | 'subscriber' | 'any' (default 'any')
--     'subscriber' means an email address with no person attached at all -
--     the common case for someone who only ever filled in the survey/report
--     form on the marketing site (email_addresses.person_id is nullable by
--     design; see migration 3's comment on that column). Without this
--     branch, a plain "everyone opted into blog" send would silently miss
--     most of its actual audience.
--   practice_areas: text[] - OR match against candidate_profiles.practice_areas
--     (for the candidate branch) or firms.practice_areas (for the firm-contact
--     branch, via firm_contacts) - not applicable to subscribers
--   pqe_min / pqe_max: numeric - candidates only, ignored otherwise
--   candidate_status: text - candidates only, ignored otherwise
--   opted_in_purpose: 'blog' | 'recruitment' | 'report' - applies to all three

-- ---------------------------------------------------------------------
-- select_segment_email_ids: the one place the compound filter is
-- interpreted. Not granted to any client role directly (like
-- apply_permission_preference) - only called from the two SECURITY
-- DEFINER functions below, which do the role check.
-- ---------------------------------------------------------------------
create function select_segment_email_ids(p_filter jsonb)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ea.id from (
    select distinct on (p.id) p.id as person_id, ea.id
    from people p
    join candidate_profiles cpf on cpf.person_id = p.id
    join email_addresses ea on ea.person_id = p.id
    where p.status = 'active'
      and coalesce(p_filter ->> 'contact_type', 'any') in ('candidate', 'any')
      and (p_filter ->> 'candidate_status' is null or cpf.candidate_status = p_filter ->> 'candidate_status')
      and (p_filter ->> 'pqe_min' is null or cpf.years_pqe >= (p_filter ->> 'pqe_min')::numeric)
      and (p_filter ->> 'pqe_max' is null or cpf.years_pqe <= (p_filter ->> 'pqe_max')::numeric)
      and (
        p_filter -> 'practice_areas' is null
        or exists (
          select 1 from unnest(cpf.practice_areas) pa
          join lateral jsonb_array_elements_text(p_filter -> 'practice_areas') x on lower(x) = lower(pa)
        )
      )
      and (
        p_filter ->> 'opted_in_purpose' is null
        or exists (
          select 1 from communication_preferences cp
          where cp.email_address_id = ea.id
            and cp.purpose = (p_filter ->> 'opted_in_purpose')::permission_purpose
            and cp.status = 'opted_in'
        )
      )
    order by p.id, ea.is_primary desc, ea.created_at asc
  ) ea
  union
  select ea.id from (
    select distinct on (p.id) p.id as person_id, ea.id
    from people p
    join firm_contacts fc on fc.person_id = p.id
    join firms f on f.id = fc.firm_id
    join email_addresses ea on ea.person_id = p.id
    where p.status = 'active'
      and coalesce(p_filter ->> 'contact_type', 'any') in ('firm_contact', 'any')
      and (
        p_filter -> 'practice_areas' is null
        or exists (
          select 1 from unnest(f.practice_areas) pa
          join lateral jsonb_array_elements_text(p_filter -> 'practice_areas') x on lower(x) = lower(pa)
        )
      )
      and (
        p_filter ->> 'opted_in_purpose' is null
        or exists (
          select 1 from communication_preferences cp
          where cp.email_address_id = ea.id
            and cp.purpose = (p_filter ->> 'opted_in_purpose')::permission_purpose
            and cp.status = 'opted_in'
        )
      )
    order by p.id, ea.is_primary desc, ea.created_at asc
  ) ea
  union
  select ea.id
  from email_addresses ea
  where ea.person_id is null
    and coalesce(p_filter ->> 'contact_type', 'any') in ('subscriber', 'any')
    and (
      p_filter ->> 'opted_in_purpose' is null
      or exists (
        select 1 from communication_preferences cp
        where cp.email_address_id = ea.id
          and cp.purpose = (p_filter ->> 'opted_in_purpose')::permission_purpose
          and cp.status = 'opted_in'
      )
    );
$$;

-- ---------------------------------------------------------------------
-- compute_segment_count: read-only, no side effects - lets the UI show
-- a live "N people match" as the user adjusts filters, without having
-- to create or sync a list just to find out how many people it covers.
-- ---------------------------------------------------------------------
create function compute_segment_count(p_filter jsonb)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

  return (select count(*) from select_segment_email_ids(p_filter));
end;
$$;

grant execute on function compute_segment_count(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- sync_mailing_list_members: re-created against the new compound filter
-- in place of migration 21's three "kind" branches.
-- ---------------------------------------------------------------------
create or replace function sync_mailing_list_members(p_list_id uuid)
returns table(added bigint, removed bigint, total_active bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list mailing_lists%rowtype;
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

  select coalesce(array_agg(sid), '{}') into v_matched_ids from select_segment_email_ids(v_list.dynamic_filter) as sid;

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
-- create_ad_hoc_campaign: the one-step path the user asked for - filter,
-- see a count, pick a template, send. Creates the mailing list and
-- campaign behind the scenes (auto-named from the filter) so there is
-- no separate "name and save a list" step in the UI; the list still
-- exists underneath (campaigns need one, and it keeps the existing
-- approve/send machinery untouched) but it is not something the user
-- has to manage directly.
-- ---------------------------------------------------------------------
create function create_ad_hoc_campaign(
  p_name text,
  p_purpose permission_purpose,
  p_template_id uuid,
  p_filter jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list_id uuid;
  v_campaign_id uuid;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

  insert into mailing_lists (name, purpose, description, dynamic_filter, created_by)
  values (p_name, p_purpose, 'Auto-created for a one-off send.', p_filter, auth.uid())
  returning id into v_list_id;

  perform sync_mailing_list_members(v_list_id);

  insert into campaigns (name, purpose, template_id, list_id, status, created_by)
  values (p_name, p_purpose, p_template_id, v_list_id, 'draft', auth.uid())
  returning id into v_campaign_id;

  perform generate_campaign_recipients(v_campaign_id);

  return v_campaign_id;
end;
$$;

grant execute on function create_ad_hoc_campaign(text, permission_purpose, uuid, jsonb) to authenticated;
