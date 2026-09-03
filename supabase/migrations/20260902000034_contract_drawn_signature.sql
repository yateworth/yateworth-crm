-- The signing page's "signature box" was a live cursive preview of the
-- typed name — a nice touch, but the user asked for something they can
-- actually trace with the mouse/finger, not just watch render from
-- typed text. Adds a real drawn signature (a <canvas> on the signing
-- page, captured as a PNG data URL on submit) alongside the typed full
-- name, which stays for the textual/legal record. Still not a
-- certified e-signature (see the note at the top of migration 32) —
-- just a more convincing lightweight one.

alter table firm_contracts add column signature_image text;

-- CREATE OR REPLACE matches on the exact parameter type list, and this
-- adds a 5th parameter - so without an explicit drop first, the old
-- 4-argument version would stick around as a second overload instead
-- of actually being replaced.
drop function if exists record_contract_signature(uuid, text, text, text);

create function record_contract_signature(
  p_contract_id uuid,
  p_signed_by_name text,
  p_signed_by_email text,
  p_signature_ip text,
  p_signature_image text default null
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
    signature_ip = p_signature_ip,
    signature_image = p_signature_image
  where id = p_contract_id
  returning * into v_contract;

  update firms set relationship_stage = 'terms_signed' where id = v_contract.firm_id;

  return v_contract;
end;
$$;

-- record_contract_signature is service-role only (migration 33) -
-- create or replace preserves the existing grants (none, beyond
-- postgres/service_role), but revoke explicitly anyway per this
-- project's own "don't rely on never granting" rule.
revoke execute on function record_contract_signature(uuid, text, text, text, text) from public, anon, authenticated;
