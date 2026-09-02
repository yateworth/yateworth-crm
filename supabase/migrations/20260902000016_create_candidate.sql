-- create_candidate: atomic create across people/email_addresses/
-- candidate_profiles, matching the pattern already established by
-- submit_permission_request for multi-table writes from a single client
-- action. Without this, the client would need three separate inserts,
-- and a failure partway through would leave an orphaned people row with
-- no email or candidate_profiles.
--
-- email_addresses.email is unique, and this project already writes rows
-- there from the marketing site's survey/report-request flow with no
-- person attached - a real recruiter is quite likely to add someone as
-- a candidate whose email the site already captured. Rather than a raw
-- unique-constraint crash (or, worse, a second person record for the
-- same human), reuse the existing email_addresses row: link it to a new
-- person if it had none, or treat this as adding candidate details to
-- the person it's already attached to. Full duplicate detection/merge
-- across near-matches is out of scope here - it's an explicit Phase 2
-- deliverable in the spec - this only handles the exact-email case.
create function create_candidate(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text default null,
  p_location text default null,
  p_current_title text default null,
  p_practice_areas text[] default '{}',
  p_years_pqe numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email citext;
  v_email_row email_addresses%rowtype;
  v_email_existed boolean;
  v_person_id uuid;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'recruiter') then
    raise exception 'not authorised';
  end if;

  v_email := normalise_email(p_email);
  select * into v_email_row from email_addresses where email = v_email;
  v_email_existed := found;

  if v_email_existed and v_email_row.person_id is not null then
    v_person_id := v_email_row.person_id;
  else
    insert into people (first_name, last_name, phone, location, source_type, created_by)
    values (p_first_name, p_last_name, p_phone, p_location, 'manual', auth.uid())
    returning id into v_person_id;

    if v_email_existed then
      update email_addresses set person_id = v_person_id where id = v_email_row.id;
    else
      insert into email_addresses (person_id, email, is_primary) values (v_person_id, v_email, true);
    end if;
  end if;

  insert into candidate_profiles (person_id, current_title, practice_areas, years_pqe, candidate_status)
  values (v_person_id, p_current_title, p_practice_areas, p_years_pqe, 'prospective')
  on conflict (person_id) do update set
    current_title = excluded.current_title,
    practice_areas = excluded.practice_areas,
    years_pqe = excluded.years_pqe;

  return v_person_id;
end;
$$;

grant execute on function create_candidate(text, text, text, text, text, text, text[], numeric) to authenticated;
