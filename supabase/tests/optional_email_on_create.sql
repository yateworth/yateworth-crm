-- Optional email on create_candidate/create_firm_contact (migration 27).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/optional_email_on_create.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
grant select, insert on test_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

do $$
declare
  v_seq int := 0;
  v_person_id uuid;
  v_email_count int;
  v_firm_id uuid;
  v_contact_id uuid;
begin
  -- 1. create_candidate works with no email at all
  v_person_id := create_candidate('No', 'Email', null, null, null, 'Graduate', array['Property'], 1);
  select count(*) into v_email_count from email_addresses where person_id = v_person_id;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_person_id is not null and v_email_count = 0
    then 'PASS 1: create_candidate works with no email, and creates no email_addresses row'
    else format('FAIL 1: person_id=%s email_count=%s', v_person_id, v_email_count) end);

  -- 2. create_candidate still works, and still dedups, when an email IS given
  declare
    v_first_id uuid;
    v_second_id uuid;
  begin
    v_first_id := create_candidate('Has', 'Email', 'optional-email-test@example.com', null, null, null, '{}', null);
    v_second_id := create_candidate('Has', 'Email', 'optional-email-test@example.com', null, null, null, '{}', null);
    v_seq := v_seq + 1;
    insert into test_results values (v_seq,
      case when v_first_id = v_second_id then 'PASS 2: an email is still deduplicated correctly when given'
      else 'FAIL 2: the same email created two different people' end);
  end;

  -- 3. create_firm_contact works with no email
  insert into firms (name) values ('Optional Email Test Firm') returning id into v_firm_id;
  v_contact_id := create_firm_contact(v_firm_id, 'No', 'Email', null, null, 'Office Manager', false);
  select count(*) into v_email_count from email_addresses where person_id = v_contact_id;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_contact_id is not null and v_email_count = 0
    then 'PASS 3: create_firm_contact works with no email'
    else format('FAIL 3: contact_id=%s email_count=%s', v_contact_id, v_email_count) end);

  -- 4. an unauthorised caller is still rejected (role check unaffected by this change)
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  v_seq := v_seq + 1;
  begin
    perform create_candidate('Nope', 'Nope', null);
    insert into test_results values (v_seq, 'FAIL 4: an unauthorised caller created a candidate with no email');
  exception when others then
    insert into test_results values (v_seq, 'PASS 4: create_candidate still rejects an unauthorised caller');
  end;
end $$;

select * from test_results order by seq;

rollback;
