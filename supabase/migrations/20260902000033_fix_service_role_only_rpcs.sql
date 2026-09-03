-- Real bug found live, immediately after shipping migration 32: sending
-- a contract failed with "not authorised" for a real admin/recruiter
-- session. Root cause: send-contract.ts/send-invoice.ts already verify
-- the caller's session and role themselves (same pattern as
-- send-direct-email.ts), then call create_contract/mark_contract_sent/
-- create_invoice/mark_invoice_sent through the SERVICE ROLE client
-- (getSupabaseAdmin()) - deliberately, since writing email_messages and
-- activities rows from that same request needs service role regardless
-- (both are insert-restricted to no client role at all). But those four
-- functions ALSO carried their own `current_app_role() is null or ...`
-- check, which reads auth.uid() from a request JWT - and a service-role
-- call has no JWT/auth.uid() context at all, so current_app_role() is
-- always NULL for it, and the check always raised 'not authorised'. The
-- functions that ARE called directly from the browser with the user's
-- own session - void_contract - correctly kept working, since it never
-- goes through the service role and does have a real JWT to check.
--
-- Fix: create_contract/mark_contract_sent/create_invoice/
-- mark_invoice_sent drop the internal role check entirely (the calling
-- Netlify function is now the only thing that gates access, exactly
-- like send-direct-email.ts's own writes) and, in exchange, are locked
-- down to service_role only - same shape as record_contract_signature/
-- record_invoice_viewed, and the same "explicit revoke, don't rely on
-- never granting" lesson from migration 31/32.

create or replace function create_contract(
  p_firm_id uuid,
  p_template_id uuid,
  p_sent_to_person_id uuid,
  p_fee_percent numeric,
  p_guarantee_days int
)
returns firm_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_firm firms%rowtype;
  v_body text;
  v_rendered text;
  v_contract firm_contracts%rowtype;
begin
  select * into v_firm from firms where id = p_firm_id;
  if not found then
    raise exception 'firm not found: %', p_firm_id using errcode = 'P0001';
  end if;

  select body_html into v_body from contract_templates where id = p_template_id;
  if not found then
    raise exception 'contract template not found: %', p_template_id using errcode = 'P0001';
  end if;

  v_rendered := v_body;
  v_rendered := replace(v_rendered, '{{firm_name}}', coalesce(v_firm.legal_name, v_firm.name));
  v_rendered := replace(v_rendered, '{{fee_percent}}', coalesce(p_fee_percent::text, 'TBC'));
  v_rendered := replace(v_rendered, '{{guarantee_days}}', coalesce(p_guarantee_days::text, 'TBC'));
  v_rendered := replace(v_rendered, '{{today}}', to_char(now(), 'DD Mon YYYY'));

  insert into firm_contracts (
    firm_id, template_id, sent_to_person_id, fee_percent, guarantee_days,
    body_html_snapshot, status, created_by
  ) values (
    p_firm_id, p_template_id, p_sent_to_person_id, p_fee_percent, p_guarantee_days,
    v_rendered, 'draft', auth.uid()
  )
  returning * into v_contract;

  return v_contract;
end;
$$;

revoke execute on function create_contract(uuid, uuid, uuid, numeric, int) from public, anon, authenticated;

create or replace function mark_contract_sent(p_contract_id uuid)
returns firm_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract firm_contracts%rowtype;
begin
  update firm_contracts set status = 'sent', sent_at = now()
  where id = p_contract_id and status = 'draft'
  returning * into v_contract;

  if not found then
    raise exception 'contract not found or not in draft status: %', p_contract_id using errcode = 'P0001';
  end if;

  update firms set relationship_stage = 'terms_sent'
  where id = v_contract.firm_id and relationship_stage in ('prospect', 'contacted');

  return v_contract;
end;
$$;

revoke execute on function mark_contract_sent(uuid) from public, anon, authenticated;

create or replace function create_invoice(
  p_placement_id uuid,
  p_sent_to_person_id uuid,
  p_due_days int default 14,
  p_gst_rate numeric default 0.10
)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placement placements%rowtype;
  v_gst numeric(12,2);
  v_total numeric(12,2);
  v_invoice invoices%rowtype;
begin
  select * into v_placement from placements where id = p_placement_id;
  if not found then
    raise exception 'placement not found: %', p_placement_id using errcode = 'P0001';
  end if;
  if v_placement.fee_amount is null then
    raise exception 'no fee has been recorded for this placement yet' using errcode = 'P0001';
  end if;

  v_gst := round(v_placement.fee_amount * p_gst_rate, 2);
  v_total := v_placement.fee_amount + v_gst;

  insert into invoices (
    placement_id, invoice_number, amount, gst_amount, total_amount, due_at, sent_to_person_id, created_by
  ) values (
    p_placement_id,
    'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 4, '0'),
    v_placement.fee_amount, v_gst, v_total,
    (now() + (p_due_days || ' days')::interval)::date,
    p_sent_to_person_id,
    auth.uid()
  )
  returning * into v_invoice;

  update placements set invoice_status = 'invoiced'
  where id = p_placement_id and invoice_status = 'not_invoiced';

  return v_invoice;
end;
$$;

revoke execute on function create_invoice(uuid, uuid, int, numeric) from public, anon, authenticated;

create or replace function mark_invoice_sent(p_invoice_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
begin
  update invoices set sent_at = now() where id = p_invoice_id
  returning * into v_invoice;

  if not found then
    raise exception 'invoice not found: %', p_invoice_id using errcode = 'P0001';
  end if;

  return v_invoice;
end;
$$;

revoke execute on function mark_invoice_sent(uuid) from public, anon, authenticated;

-- void_contract is the one function from migration 32 that's genuinely
-- meant to be called directly from the browser (src/lib/contracts.ts,
-- with the user's own session) and correctly kept its role check - but
-- it still had the same leftover anon grant every other function in
-- this project has had (Supabase's default privileges, not anything
-- this file wrote). Its own current_app_role() check already rejects an
-- anon caller (no JWT means no auth.uid(), so current_app_role() is
-- null), but per this project's own rule from migration 31 - revoke the
-- grant explicitly, don't rely solely on the internal check.
revoke execute on function void_contract(uuid) from anon;
