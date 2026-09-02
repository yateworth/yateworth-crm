-- Ad-hoc compound segment assertions (migration 23).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/ad_hoc_segments.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
create temporary table test_ids (
  candidate_email_id uuid, contact_email_id uuid, firm_id uuid, template_id uuid
) on commit drop;
grant select, insert on test_results to authenticated;
grant select on test_ids to authenticated;

-- Setup as the unrestricted default role, for the same reason as
-- campaigns_management.sql: email_addresses/communication_preferences/
-- people/candidate_profiles have no insert policy for any client role.
do $$
declare
  v_candidate_person_id uuid;
  v_candidate_email_id uuid;
  v_contact_person_id uuid;
  v_contact_email_id uuid;
  v_firm_id uuid;
  v_template_id uuid;
begin
  insert into firms (name, practice_areas) values ('Segment Test Firm', array['Banking & Finance'])
  returning id into v_firm_id;

  insert into people (first_name, last_name, status) values ('Seg', 'Candidate', 'active')
  returning id into v_candidate_person_id;
  insert into email_addresses (person_id, email, is_primary) values (v_candidate_person_id, 'seg-candidate@example.com', true)
  returning id into v_candidate_email_id;
  insert into candidate_profiles (person_id, practice_areas, years_pqe, candidate_status)
  values (v_candidate_person_id, array['Banking & Finance'], 4, 'active');
  insert into communication_preferences (email_address_id, purpose, status, kind, source)
  values (v_candidate_email_id, 'recruitment', 'opted_in', 'ongoing', 'test setup');

  insert into people (first_name, last_name, status) values ('Seg', 'Contact', 'active')
  returning id into v_contact_person_id;
  insert into email_addresses (person_id, email, is_primary) values (v_contact_person_id, 'seg-contact@example.com', true)
  returning id into v_contact_email_id;
  insert into firm_contacts (firm_id, person_id, role_title) values (v_firm_id, v_contact_person_id, 'HR Manager');

  insert into email_templates (name, purpose, subject_template, html_template, text_template)
  values ('Segment test template', 'recruitment', 'Hello', '<p>Hi</p>', 'Hi')
  returning id into v_template_id;

  insert into test_ids (candidate_email_id, contact_email_id, firm_id, template_id)
  values (v_candidate_email_id, v_contact_email_id, v_firm_id, v_template_id);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

do $$
declare
  v_seq int := 0;
  v_candidate_email_id uuid;
  v_contact_email_id uuid;
  v_template_id uuid;
  v_count bigint;
  v_campaign_id uuid;
  v_recipient_count int;
begin
  select candidate_email_id, contact_email_id, template_id into v_candidate_email_id, v_contact_email_id, v_template_id
  from test_ids;

  -- 1. practice_area + pqe range matches the candidate, not the firm contact
  select compute_segment_count(jsonb_build_object(
    'contact_type', 'candidate', 'practice_areas', jsonb_build_array('Banking & Finance'),
    'pqe_min', 2, 'pqe_max', 6
  )) into v_count;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_count >= 1 then 'PASS 1: candidate branch matches on practice area + PQE range'
    else format('FAIL 1: count=%s', v_count) end);

  -- 2. a PQE range that excludes the candidate returns no match for them
  select compute_segment_count(jsonb_build_object(
    'contact_type', 'candidate', 'pqe_min', 10, 'pqe_max', 15
  )) into v_count;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when not exists (
      select 1 from select_segment_email_ids(jsonb_build_object('contact_type', 'candidate', 'pqe_min', 10, 'pqe_max', 15)) as sid
      where sid = v_candidate_email_id
    ) then 'PASS 2: a non-matching PQE range excludes the candidate'
    else 'FAIL 2: the candidate matched a PQE range they are outside of' end);

  -- 3. firm_contact branch matches via the firm's practice areas, not the person's
  select compute_segment_count(jsonb_build_object(
    'contact_type', 'firm_contact', 'practice_areas', jsonb_build_array('Banking & Finance')
  )) into v_count;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (
      select 1 from select_segment_email_ids(jsonb_build_object('contact_type', 'firm_contact', 'practice_areas', jsonb_build_array('Banking & Finance'))) as sid
      where sid = v_contact_email_id
    ) then 'PASS 3: firm_contact branch matches via the firm''s practice areas'
    else 'FAIL 3: the firm contact did not match' end);

  -- 4. contact_type=firm_contact never matches a pure candidate
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when not exists (
      select 1 from select_segment_email_ids(jsonb_build_object('contact_type', 'firm_contact')) as sid
      where sid = v_candidate_email_id
    ) then 'PASS 4: firm_contact filter excludes a person who is only a candidate'
    else 'FAIL 4: the candidate leaked into the firm_contact branch' end);

  -- 5. opted_in_purpose narrows correctly (candidate opted into recruitment, not blog)
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (
        select 1 from select_segment_email_ids(jsonb_build_object('opted_in_purpose', 'recruitment')) as sid where sid = v_candidate_email_id
      ) and not exists (
        select 1 from select_segment_email_ids(jsonb_build_object('opted_in_purpose', 'blog')) as sid where sid = v_candidate_email_id
      )
    then 'PASS 5: opted_in_purpose filters correctly by purpose'
    else 'FAIL 5: opted_in_purpose did not filter correctly' end);

  -- 6. an unauthorised caller cannot call compute_segment_count
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  v_seq := v_seq + 1;
  begin
    perform compute_segment_count('{}'::jsonb);
    insert into test_results values (v_seq, 'FAIL 6: an unauthorised caller computed a segment count');
  exception when others then
    insert into test_results values (v_seq, 'PASS 6: compute_segment_count rejects an unauthorised caller');
  end;

  -- 7. an unauthorised caller cannot create an ad-hoc campaign
  v_seq := v_seq + 1;
  begin
    perform create_ad_hoc_campaign('Nope', 'recruitment', v_template_id, '{}'::jsonb);
    insert into test_results values (v_seq, 'FAIL 7: an unauthorised caller created an ad-hoc campaign');
  exception when others then
    insert into test_results values (v_seq, 'PASS 7: create_ad_hoc_campaign rejects an unauthorised caller');
  end;
  perform set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

  -- 8. create_ad_hoc_campaign builds a list, campaign and recipients in one call
  select create_ad_hoc_campaign(
    'Ad hoc test send', 'recruitment', v_template_id,
    jsonb_build_object('contact_type', 'candidate', 'practice_areas', jsonb_build_array('Banking & Finance'))
  ) into v_campaign_id;
  select count(*) into v_recipient_count from campaign_recipients where campaign_id = v_campaign_id;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_recipient_count >= 1 then 'PASS 8: create_ad_hoc_campaign produces a campaign with recipients'
    else format('FAIL 8: recipient_count=%s', v_recipient_count) end);
end $$;

select * from test_results order by seq;

rollback;
