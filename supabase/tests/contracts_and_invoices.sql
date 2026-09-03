-- Contracts and invoices assertions (migration 32).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/contracts_and_invoices.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
grant select, insert on test_results to authenticated;

do $$
declare
  v_firm_id uuid;
  v_template_id uuid;
  v_contact_person_id uuid;
  v_candidate_person_id uuid;
  v_candidate2_person_id uuid;
  v_job_id uuid;
  v_submission_id uuid;
  v_submission2_id uuid;
  v_placement_id uuid;
  v_bare_placement_id uuid;
begin
  insert into firms (name, legal_name) values ('Contracts Test Firm', 'Contracts Test Firm Pty Ltd') returning id into v_firm_id;
  select id into v_template_id from contract_templates limit 1;

  insert into people (first_name, last_name) values ('Fee', 'Contactperson') returning id into v_contact_person_id;

  insert into people (first_name, last_name) values ('Cand', 'Idate') returning id into v_candidate_person_id;
  insert into candidate_profiles (person_id) values (v_candidate_person_id);
  insert into people (first_name, last_name) values ('Second', 'Candidate') returning id into v_candidate2_person_id;
  insert into candidate_profiles (person_id) values (v_candidate2_person_id);

  insert into jobs (firm_id, title) values (v_firm_id, 'Contracts Test Role') returning id into v_job_id;
  insert into submissions (job_id, candidate_id, stage) values (v_job_id, v_candidate_person_id, 'placed') returning id into v_submission_id;
  insert into placements (submission_id, fee_amount) values (v_submission_id, 10000) returning id into v_placement_id;

  -- a second placement with no fee recorded yet, to prove create_invoice
  -- rejects it rather than generating an invoice full of blanks
  insert into submissions (job_id, candidate_id, stage) values (v_job_id, v_candidate2_person_id, 'placed') returning id into v_submission2_id;
  insert into placements (submission_id) values (v_submission2_id) returning id into v_bare_placement_id;

  insert into test_results (seq, result) values (0,
    v_firm_id::text || ',' || v_template_id::text || ',' || v_contact_person_id::text || ',' || v_placement_id::text || ',' || v_bare_placement_id::text);
end $$;

set local role authenticated;

-- 1. create_contract rejects an unauthorised (no-profile) caller
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
do $$
declare
  v_firm_id uuid;
  v_template_id uuid;
  v_contact_person_id uuid;
begin
  select split_part(result, ',', 1)::uuid, split_part(result, ',', 2)::uuid, split_part(result, ',', 3)::uuid
    into v_firm_id, v_template_id, v_contact_person_id
    from test_results where seq = 0;
  perform create_contract(v_firm_id, v_template_id, v_contact_person_id, 20, 90);
  insert into test_results values (1, 'FAIL 1: create_contract was callable by an unauthorised caller');
exception when others then
  insert into test_results values (1, 'PASS 1: create_contract rejects an unauthorised caller');
end $$;

-- 2. as a real admin: create_contract renders merge fields into the
-- snapshot, and the contract starts in 'draft' (not yet 'sent')
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);
do $$
declare
  v_firm_id uuid;
  v_template_id uuid;
  v_contact_person_id uuid;
  v_contract firm_contracts%rowtype;
begin
  select split_part(result, ',', 1)::uuid, split_part(result, ',', 2)::uuid, split_part(result, ',', 3)::uuid
    into v_firm_id, v_template_id, v_contact_person_id
    from test_results where seq = 0;

  select * into v_contract from create_contract(v_firm_id, v_template_id, v_contact_person_id, 20, 90);

  insert into test_results values (2,
    case when v_contract.status = 'draft'
      and v_contract.body_html_snapshot like '%Contracts Test Firm Pty Ltd%'
      and v_contract.body_html_snapshot like '%20%'
      and v_contract.body_html_snapshot like '%90 days%'
    then 'PASS 2: create_contract renders merge fields and starts as draft'
    else 'FAIL 2: create_contract output was wrong: ' || v_contract.status || ' / ' || left(v_contract.body_html_snapshot, 200) end);

  insert into test_results values (10, v_contract.id::text);
end $$;

-- 3. mark_contract_sent advances a prospect/contacted firm to
-- terms_sent, and the contract itself becomes 'sent'
do $$
declare
  v_contract_id uuid;
  v_firm_id uuid;
  v_contract firm_contracts%rowtype;
  v_stage firm_relationship_stage;
begin
  select result::uuid into v_contract_id from test_results where seq = 10;
  select split_part(result, ',', 1)::uuid into v_firm_id from test_results where seq = 0;

  select * into v_contract from mark_contract_sent(v_contract_id);
  select relationship_stage into v_stage from firms where id = v_firm_id;

  insert into test_results values (3,
    case when v_contract.status = 'sent' and v_contract.sent_at is not null and v_stage = 'terms_sent'
    then 'PASS 3: mark_contract_sent flips status and advances a cold firm to terms_sent'
    else 'FAIL 3: mark_contract_sent did not behave as expected (status=' || v_contract.status || ', stage=' || v_stage || ')' end);
end $$;

-- 4. record_contract_signature is not directly callable by any client
-- role - it has no internal role check of its own, so rejection must
-- come from never being granted execute in the first place
do $$
declare
  v_contract_id uuid;
begin
  select result::uuid into v_contract_id from test_results where seq = 10;
  perform record_contract_signature(v_contract_id, 'Someone', 'someone@example.com', '127.0.0.1');
  insert into test_results values (4, 'FAIL 4: record_contract_signature was callable directly by an authenticated client');
exception when insufficient_privilege then
  insert into test_results values (4, 'PASS 4: record_contract_signature is not directly callable');
end $$;

reset role;

-- 5. As postgres (bypasses RLS/grants, simulating the service-role path
-- sign-contract.ts actually uses): signing advances the firm straight to
-- terms_signed, and a second signature call is idempotent - it does not
-- overwrite signed_at/signed_by_name.
do $$
declare
  v_contract_id uuid;
  v_firm_id uuid;
  v_contract firm_contracts%rowtype;
  v_first_signed_at timestamptz;
  v_stage firm_relationship_stage;
begin
  select result::uuid into v_contract_id from test_results where seq = 10;
  select split_part(result, ',', 1)::uuid into v_firm_id from test_results where seq = 0;

  select * into v_contract from record_contract_signature(v_contract_id, 'Jamie Signer', 'jamie@contractstestfirm.example', '203.0.113.4');
  v_first_signed_at := v_contract.signed_at;
  select relationship_stage into v_stage from firms where id = v_firm_id;

  select * into v_contract from record_contract_signature(v_contract_id, 'Someone Else', 'other@example.com', '10.0.0.1');

  insert into test_results values (5,
    case when v_contract.status = 'signed'
      and v_contract.signed_by_name = 'Jamie Signer'
      and v_contract.signed_at = v_first_signed_at
      and v_stage = 'terms_signed'
    then 'PASS 5: record_contract_signature is idempotent and advances the firm to terms_signed'
    else 'FAIL 5: signature was overwritten or stage was not advanced (signed_by=' || v_contract.signed_by_name || ', stage=' || v_stage || ')' end);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

-- 6. void_contract refuses to void an already-signed contract
do $$
declare
  v_contract_id uuid;
begin
  select result::uuid into v_contract_id from test_results where seq = 10;
  perform void_contract(v_contract_id);
  insert into test_results values (6, 'FAIL 6: void_contract voided an already-signed contract');
exception when others then
  insert into test_results values (6, 'PASS 6: void_contract refuses to void a signed contract');
end $$;

-- 7. create_invoice refuses a placement with no fee recorded
do $$
declare
  v_bare_placement_id uuid;
begin
  select split_part(result, ',', 5)::uuid into v_bare_placement_id from test_results where seq = 0;
  perform create_invoice(v_bare_placement_id, null);
  insert into test_results values (7, 'FAIL 7: create_invoice accepted a placement with no fee recorded');
exception when others then
  insert into test_results values (7, 'PASS 7: create_invoice rejects a placement with no fee recorded');
end $$;

-- 8. create_invoice computes GST/total correctly and flips
-- placements.invoice_status from not_invoiced to invoiced
do $$
declare
  v_placement_id uuid;
  v_contact_person_id uuid;
  v_invoice invoices%rowtype;
  v_invoice_status invoice_status;
begin
  select split_part(result, ',', 4)::uuid, split_part(result, ',', 3)::uuid
    into v_placement_id, v_contact_person_id
    from test_results where seq = 0;

  select * into v_invoice from create_invoice(v_placement_id, v_contact_person_id, 14, 0.10);
  select invoice_status into v_invoice_status from placements where id = v_placement_id;

  insert into test_results values (8,
    case when v_invoice.amount = 10000 and v_invoice.gst_amount = 1000 and v_invoice.total_amount = 11000
      and v_invoice_status = 'invoiced'
    then 'PASS 8: create_invoice computes GST/total correctly and flips invoice_status to invoiced'
    else 'FAIL 8: create_invoice output was wrong (amount=' || v_invoice.amount || ', gst=' || v_invoice.gst_amount
      || ', total=' || v_invoice.total_amount || ', status=' || v_invoice_status || ')' end);

  insert into test_results values (11, v_invoice.id::text);
end $$;

-- 9. record_invoice_viewed is not directly callable by any client role
do $$
declare
  v_invoice_id uuid;
begin
  select result::uuid into v_invoice_id from test_results where seq = 11;
  perform record_invoice_viewed(v_invoice_id);
  insert into test_results values (9, 'FAIL 9: record_invoice_viewed was callable directly by an authenticated client');
exception when insufficient_privilege then
  insert into test_results values (9, 'PASS 9: record_invoice_viewed is not directly callable');
end $$;

reset role;

-- 10. As postgres (service-role path): record_invoice_viewed is
-- idempotent - a second view doesn't move viewed_at.
do $$
declare
  v_invoice_id uuid;
  v_invoice invoices%rowtype;
  v_first_viewed_at timestamptz;
begin
  select result::uuid into v_invoice_id from test_results where seq = 11;

  select * into v_invoice from record_invoice_viewed(v_invoice_id);
  v_first_viewed_at := v_invoice.viewed_at;

  perform pg_sleep(0.01);
  select * into v_invoice from record_invoice_viewed(v_invoice_id);

  insert into test_results values (12,
    case when v_invoice.viewed_at = v_first_viewed_at and v_first_viewed_at is not null
    then 'PASS 10: record_invoice_viewed is idempotent'
    else 'FAIL 10: viewed_at moved on a second view' end);
end $$;

select seq, result from test_results where seq in (1,2,3,4,5,6,7,8,9,12) order by seq;

rollback;
