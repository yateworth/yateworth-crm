-- Email was a required parameter on create_candidate/create_firm_contact
-- from the start, on the assumption a recruiter always has it in hand
-- when adding someone. Direct feedback: a call often produces a name
-- before an email address, and the assistant (and the manual forms)
-- should not force one to be invented or block adding the person. Both
-- functions still fully support the existing behaviour when an email is
-- given (reuse-by-email, dedup) - this only makes the parameter
-- optional, matching email_addresses.person_id already being nullable
-- by design (migration 3).

create or replace function create_candidate(
  p_first_name text,
  p_last_name text,
  p_email text default null,
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

  if p_email is not null and length(trim(p_email)) > 0 then
    v_email := normalise_email(p_email);
    select * into v_email_row from email_addresses where email = v_email;
    v_email_existed := found;
  else
    v_email_existed := false;
  end if;

  if v_email_existed and v_email_row.person_id is not null then
    v_person_id := v_email_row.person_id;
  else
    insert into people (first_name, last_name, phone, location, source_type, created_by)
    values (p_first_name, p_last_name, p_phone, p_location, 'manual', auth.uid())
    returning id into v_person_id;

    if v_email is not null then
      if v_email_existed then
        update email_addresses set person_id = v_person_id where id = v_email_row.id;
      else
        insert into email_addresses (person_id, email, is_primary) values (v_person_id, v_email, true);
      end if;
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

create or replace function create_firm_contact(
  p_firm_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text default null,
  p_phone text default null,
  p_role_title text default null,
  p_is_primary boolean default false
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

  if not exists (select 1 from firms where id = p_firm_id) then
    raise exception 'firm not found: %', p_firm_id using errcode = 'P0001';
  end if;

  if p_email is not null and length(trim(p_email)) > 0 then
    v_email := normalise_email(p_email);
    select * into v_email_row from email_addresses where email = v_email;
    v_email_existed := found;
  else
    v_email_existed := false;
  end if;

  if v_email_existed and v_email_row.person_id is not null then
    v_person_id := v_email_row.person_id;
  else
    insert into people (first_name, last_name, phone, source_type, created_by)
    values (p_first_name, p_last_name, p_phone, 'manual', auth.uid())
    returning id into v_person_id;

    if v_email is not null then
      if v_email_existed then
        update email_addresses set person_id = v_person_id where id = v_email_row.id;
      else
        insert into email_addresses (person_id, email, is_primary) values (v_person_id, v_email, true);
      end if;
    end if;
  end if;

  insert into firm_contacts (firm_id, person_id, role_title, is_primary, created_by)
  values (p_firm_id, v_person_id, p_role_title, p_is_primary, auth.uid())
  on conflict (firm_id, person_id) do update set
    role_title = excluded.role_title,
    is_primary = excluded.is_primary;

  return v_person_id;
end;
$$;
