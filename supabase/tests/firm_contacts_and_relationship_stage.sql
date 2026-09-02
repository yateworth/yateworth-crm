-- Firm contacts + relationship stage assertions (migration 22).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/firm_contacts_and_relationship_stage.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
grant select, insert on test_results to authenticated;

do $$
declare
  v_firm_id uuid;
begin
  insert into firms (name) values ('Test Firm for Contacts') returning id into v_firm_id;
  insert into test_results (seq, result) values (0, v_firm_id::text);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

do $$
declare
  v_seq int := 1;
  v_firm_id uuid;
  v_person_id uuid;
  v_second_person_id uuid;
  v_role_title text;
  v_email_id uuid;
  v_existing_email citext := 'firm-contact-test@example.com';
begin
  select result::uuid into v_firm_id from test_results where seq = 0;

  -- 1. create_firm_contact creates a person + email + join row
  v_person_id := create_firm_contact(v_firm_id, 'Jamie', 'Contact', v_existing_email, '0400000000', 'HR Manager', true);
  select role_title into v_role_title from firm_contacts where firm_id = v_firm_id and person_id = v_person_id;
  insert into test_results values (v_seq,
    case when v_role_title = 'HR Manager' then 'PASS 1: create_firm_contact links a new person to the firm'
    else format('FAIL 1: role_title=%s', v_role_title) end);
  v_seq := v_seq + 1;

  -- 2. re-running with the same email reuses the person, doesn't duplicate
  select id into v_email_id from email_addresses where email = v_existing_email;
  perform create_firm_contact(v_firm_id, 'Jamie', 'Contact', v_existing_email, '0400000000', 'Senior HR Manager', true);
  insert into test_results values (v_seq,
    case when (select count(*) from email_addresses where email = v_existing_email) = 1
      and (select role_title from firm_contacts where firm_id = v_firm_id and person_id = v_person_id) = 'Senior HR Manager'
    then 'PASS 2: re-adding the same email reuses the person and updates the role'
    else 'FAIL 2: a duplicate email or person was created' end);
  v_seq := v_seq + 1;

  -- 3. only one primary contact per firm is allowed
  v_seq := v_seq + 1;
  begin
    perform create_firm_contact(v_firm_id, 'Alex', 'Second', 'firm-contact-test-2@example.com', null, 'Partner', true);
    insert into test_results values (v_seq, 'FAIL 3: a second primary contact was allowed for the same firm');
  exception when others then
    insert into test_results values (v_seq, 'PASS 3: only one primary contact per firm is allowed');
  end;

  -- 4. an unauthorised caller cannot create a firm contact
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  v_seq := v_seq + 1;
  begin
    perform create_firm_contact(v_firm_id, 'Nope', 'Nope', 'nope@example.com', null, null, false);
    insert into test_results values (v_seq, 'FAIL 4: an unauthorised caller created a firm contact');
  exception when others then
    insert into test_results values (v_seq, 'PASS 4: create_firm_contact rejects an unauthorised caller');
  end;
end $$;

select * from test_results where seq > 0 order by seq;

rollback;
