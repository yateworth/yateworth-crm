-- create_candidate assertions. Wrapped in BEGIN/ROLLBACK.
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/create_candidate.sql

begin;

select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
  v_person_id uuid;
  v_person_id_2 uuid;
  v_existing_person_id uuid;
  v_existing_email_id uuid;
begin
  -- 1. brand new email: creates person + email_addresses + candidate_profiles
  v_person_id := create_candidate('Cand', 'Onetest', 'cand.onetest@example-seed.test', '0400000001', 'Sydney', 'Associate', array['Commercial'], 3);

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (select 1 from people where id = v_person_id and first_name = 'Cand')
      and exists (select 1 from email_addresses where person_id = v_person_id and email = 'cand.onetest@example-seed.test' and is_primary)
      and exists (select 1 from candidate_profiles where person_id = v_person_id and current_title = 'Associate')
    then 'PASS 1: brand new email creates person + email + candidate_profiles'
    else 'FAIL 1: one or more rows missing for a brand new email' end);

  -- 2. an email that exists but has no person attached (e.g. from a
  -- prior survey report request) gets linked to the new person, rather
  -- than erroring on the unique constraint or creating an orphan
  insert into email_addresses (email) values ('cand.twotest@example-seed.test') returning id into v_existing_email_id;

  v_person_id_2 := create_candidate('Cand', 'Twotest', 'cand.twotest@example-seed.test', null, null, 'Lawyer', array['Family'], 5);

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select person_id from email_addresses where id = v_existing_email_id) = v_person_id_2
      and exists (select 1 from candidate_profiles where person_id = v_person_id_2)
    then 'PASS 2: pre-existing unlinked email is linked to the new person, not duplicated'
    else 'FAIL 2: pre-existing email was not correctly linked' end);

  -- 3. an email already linked to an existing person reuses that
  -- person rather than creating a second one
  v_existing_person_id := create_candidate('Cand', 'Threetest', 'cand.threetest@example-seed.test', null, null, 'Graduate', array['Litigation'], 0);
  v_person_id_2 := create_candidate('Different', 'Name', 'cand.threetest@example-seed.test', null, null, 'Senior Associate', array['Litigation'], 6);

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_person_id_2 = v_existing_person_id
      and (select count(*) from people where id = v_existing_person_id) = 1
      and (select current_title from candidate_profiles where person_id = v_existing_person_id) = 'Senior Associate'
    then 'PASS 3: an email already linked to a person reuses that person and updates candidate_profiles'
    else 'FAIL 3: a duplicate person was created for an already-linked email' end);

  -- 4. an invalid email is rejected (normalise_email's own validation)
  v_seq := v_seq + 1;
  begin
    perform create_candidate('Bad', 'Email', 'not-an-email');
    insert into test_results values (v_seq, 'FAIL 4: an invalid email was accepted');
  exception when others then
    insert into test_results values (v_seq, 'PASS 4: an invalid email is rejected');
  end;
end $$;

select * from test_results order by seq;

rollback;
