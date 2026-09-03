-- Send-a-recruitment-contract-for-signature, and send-an-invoice,
-- requested directly by the user. Two related but independent document
-- flows, built the same shape: a template rendered into a snapshot at
-- send time (so editing the template later never rewrites history,
-- matching how campaigns snapshot recipient/eligibility state), a
-- signed-token public link (same HMAC pattern as the unsubscribe link,
-- verified in netlify/functions/_shared/documentToken.ts against a
-- dedicated DOCUMENT_TOKEN_SECRET, not the unsubscribe one — different
-- blast radius if either ever leaked), and a public no-login page
-- server-rendered directly by the Netlify function, same as
-- unsubscribe.ts, rather than a new authenticated-app route.
--
-- Contract signing is a deliberately lightweight, self-built e-signature:
-- a typed name + timestamp + IP captured against a uniquely-tokened link,
-- not a certified signature like DocuSign. Chosen directly by the user
-- over integrating a real e-signature provider, to avoid a new paid
-- third-party dependency for what is, for now, an internal record of
-- agreement rather than a document that itself needs to hold up as
-- independently-verified evidence.

-- ---------------------------------------------------------------------
-- Contracts
-- ---------------------------------------------------------------------

create type contract_status as enum ('draft', 'sent', 'signed', 'void');

-- One template to start (seeded below) rather than a full multi-template
-- editor page — the table exists so adding more, or an edit UI, later is
-- a page, not a schema change. {{firm_name}}, {{fee_percent}},
-- {{guarantee_days}} and {{today}} are the merge fields create_contract
-- understands.
create table contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body_html text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger contract_templates_set_updated_at before update on contract_templates
  for each row execute function set_updated_at();

create table firm_contracts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete restrict,
  template_id uuid references contract_templates(id),
  sent_to_person_id uuid references people(id),
  fee_percent numeric(5,2),
  guarantee_days int,
  body_html_snapshot text not null,
  status contract_status not null default 'draft',
  sent_at timestamptz,
  signed_at timestamptz,
  signed_by_name text,
  signed_by_email text,
  signature_ip text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index firm_contracts_firm_idx on firm_contracts(firm_id, created_at desc);

create trigger firm_contracts_set_updated_at before update on firm_contracts
  for each row execute function set_updated_at();
create trigger firm_contracts_audit after insert or update or delete on firm_contracts
  for each row execute function audit_row_change();

alter table contract_templates enable row level security;
alter table firm_contracts enable row level security;

-- Matches firms/firm_contacts (migration 3/22): recruiter/admin manage,
-- viewer gets read-only on the contracts themselves. Templates are an
-- internal editing surface, not something a viewer role needs to see.
create policy "contract_templates_recruiter_admin_all" on contract_templates for all
  to authenticated using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));

create policy "firm_contracts_recruiter_admin_all" on firm_contracts for all
  to authenticated using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));
create policy "firm_contracts_viewer_select" on firm_contracts for select
  to authenticated using (current_app_role() = 'viewer');

insert into contract_templates (name, body_html) values (
  'Standard recruitment terms',
  '<h1>Recruitment Services Agreement</h1>' ||
  '<p><strong>Firm:</strong> {{firm_name}}</p>' ||
  '<p><strong>Date:</strong> {{today}}</p>' ||
  '<p>Yateworth Recruitment agrees to provide legal recruitment services to {{firm_name}} ' ||
  '("the Firm") on the following terms.</p>' ||
  '<h2>Fee</h2>' ||
  '<p>Where the Firm engages a candidate introduced by Yateworth Recruitment, a placement fee of ' ||
  '<strong>{{fee_percent}}%</strong> of the candidate''s first-year total remuneration is payable, ' ||
  'invoiced on the candidate''s start date.</p>' ||
  '<h2>Replacement guarantee</h2>' ||
  '<p>If the placed candidate''s employment ends within <strong>{{guarantee_days}} days</strong> of their start date, ' ||
  'for reasons other than redundancy, Yateworth Recruitment will replace the candidate at no additional fee, ' ||
  'or refund the fee on a pro-rata basis for the remaining guarantee period.</p>' ||
  '<h2>Confidentiality</h2>' ||
  '<p>Both parties agree to keep candidate details and commercial terms confidential.</p>' ||
  '<p>By signing below, the Firm agrees to be bound by these terms.</p>'
);

-- ---------------------------------------------------------------------
-- create_contract: renders the template into a snapshot and inserts the
-- contract row as 'draft'. Left in 'draft' rather than 'sent' here so
-- the caller (send-contract.ts) only marks it sent, via
-- mark_contract_sent below, once the email has actually gone out —
-- a failed send never leaves a contract falsely marked as delivered.
-- ---------------------------------------------------------------------
create function create_contract(
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
  if current_app_role() is null or current_app_role() not in ('admin', 'recruiter') then
    raise exception 'not authorised';
  end if;

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

grant execute on function create_contract(uuid, uuid, uuid, numeric, int) to authenticated;

-- ---------------------------------------------------------------------
-- mark_contract_sent: only ever moves a firm forward out of the two
-- "not yet under agreement" stages, never touches terms_signed/dormant —
-- sending a fresh contract to a firm that's already signed (a renewal,
-- say) shouldn't visually demote them back to "terms sent" on the
-- dashboard until they actually re-sign.
-- ---------------------------------------------------------------------
create function mark_contract_sent(p_contract_id uuid)
returns firm_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract firm_contracts%rowtype;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'recruiter') then
    raise exception 'not authorised';
  end if;

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

grant execute on function mark_contract_sent(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- void_contract: staff can withdraw a draft/sent contract sent in error.
-- Deliberately cannot void a signed one — that's a real executed record,
-- not something to quietly remove; a superseding contract is a new row.
-- ---------------------------------------------------------------------
create function void_contract(p_contract_id uuid)
returns firm_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract firm_contracts%rowtype;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'recruiter') then
    raise exception 'not authorised';
  end if;

  select * into v_contract from firm_contracts where id = p_contract_id;
  if not found then
    raise exception 'contract not found: %', p_contract_id using errcode = 'P0001';
  end if;
  if v_contract.status = 'signed' then
    raise exception 'cannot void a signed contract' using errcode = 'P0001';
  end if;

  update firm_contracts set status = 'void' where id = p_contract_id
  returning * into v_contract;

  return v_contract;
end;
$$;

grant execute on function void_contract(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- record_contract_signature: the only way a contract moves to 'signed'.
-- Reached only via netlify/functions/sign-contract.ts under the service
-- role, after verifying the signed link token itself — same shape as
-- record_unsubscribe (migration 12). Idempotent: signing an
-- already-signed contract again (a doubled form submit, or the same
-- link opened twice) is a no-op that returns the existing row rather
-- than erroring or overwriting signed_at/signed_by_name.
-- ---------------------------------------------------------------------
create function record_contract_signature(
  p_contract_id uuid,
  p_signed_by_name text,
  p_signed_by_email text,
  p_signature_ip text
)
returns firm_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract firm_contracts%rowtype;
begin
  select * into v_contract from firm_contracts where id = p_contract_id;
  if not found then
    raise exception 'contract not found: %', p_contract_id using errcode = 'P0001';
  end if;
  if v_contract.status = 'void' then
    raise exception 'this contract is no longer valid' using errcode = 'P0001';
  end if;

  if v_contract.status = 'signed' then
    return v_contract;
  end if;

  update firm_contracts set
    status = 'signed',
    signed_at = now(),
    signed_by_name = p_signed_by_name,
    signed_by_email = p_signed_by_email,
    signature_ip = p_signature_ip
  where id = p_contract_id
  returning * into v_contract;

  update firms set relationship_stage = 'terms_signed' where id = v_contract.firm_id;

  return v_contract;
end;
$$;

-- Confirmed live (the same way migration 31 found four older leaks):
-- Supabase's platform grants EXECUTE on every NEW function to anon/
-- authenticated/service_role/postgres automatically, regardless of
-- whether this file writes an explicit GRANT — so "never granted" isn't
-- actually true until PUBLIC/anon/authenticated are explicitly revoked,
-- same as every other internal-only function in this project. Only
-- sign-contract.ts calls this, using the service role, after verifying
-- the token itself.
revoke execute on function record_contract_signature(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------

create sequence invoice_number_seq;

create table invoices (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete restrict,
  invoice_number text not null unique,
  amount numeric(12,2) not null,
  gst_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null,
  issued_at timestamptz not null default now(),
  due_at date,
  sent_to_person_id uuid references people(id),
  sent_at timestamptz,
  viewed_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_placement_idx on invoices(placement_id, created_at desc);

create trigger invoices_set_updated_at before update on invoices
  for each row execute function set_updated_at();
create trigger invoices_audit after insert or update or delete on invoices
  for each row execute function audit_row_change();

alter table invoices enable row level security;

-- Matches placements exactly (migration 24): fee/invoice data is as
-- sensitive as anything else in the pipeline, no viewer access.
create policy "invoices_recruiter_admin_all" on invoices for all
  to authenticated using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));

-- ---------------------------------------------------------------------
-- create_invoice: fee_amount must already be recorded on the placement
-- (the "record fee" flow added earlier) — an invoice for a fee nobody
-- has entered yet would just be a document full of blanks. Also flips
-- placements.invoice_status from 'not_invoiced' to 'invoiced' the first
-- time an invoice is actually generated, but never overrides a status
-- staff already manually progressed further (paid/written_off) or
-- moved back — that dropdown remains the source of truth afterward.
-- ---------------------------------------------------------------------
create function create_invoice(
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
  if current_app_role() is null or current_app_role() not in ('admin', 'recruiter') then
    raise exception 'not authorised';
  end if;

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

grant execute on function create_invoice(uuid, uuid, int, numeric) to authenticated;

create function mark_invoice_sent(p_invoice_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'recruiter') then
    raise exception 'not authorised';
  end if;

  update invoices set sent_at = now() where id = p_invoice_id
  returning * into v_invoice;

  if not found then
    raise exception 'invoice not found: %', p_invoice_id using errcode = 'P0001';
  end if;

  return v_invoice;
end;
$$;

grant execute on function mark_invoice_sent(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- record_invoice_viewed: same shape as record_contract_signature —
-- reached only via view-invoice.ts under the service role, after
-- verifying the token. Idempotent (only ever sets viewed_at the first
-- time; a second view doesn't move the timestamp).
-- ---------------------------------------------------------------------
create function record_invoice_viewed(p_invoice_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice invoices%rowtype;
begin
  update invoices set viewed_at = coalesce(viewed_at, now())
  where id = p_invoice_id
  returning * into v_invoice;

  if not found then
    raise exception 'invoice not found: %', p_invoice_id using errcode = 'P0001';
  end if;

  return v_invoice;
end;
$$;

-- Same fix as record_contract_signature above - Supabase's default
-- privileges grant this to anon/authenticated regardless of any
-- explicit GRANT in this file, so it has to be revoked explicitly.
-- view-invoice.ts only, under the service role.
revoke execute on function record_invoice_viewed(uuid) from public, anon, authenticated;
