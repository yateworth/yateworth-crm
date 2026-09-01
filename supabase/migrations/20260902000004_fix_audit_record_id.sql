-- Fix: audit_row_change() assumed every audited table has an `id` column.
-- candidate_profiles uses `person_id` as its primary key instead, which
-- made direct `new.id` / `old.id` field access fail on INSERT/DELETE
-- (referencing a field that doesn't exist on the row type raises a
-- plpgsql error, even inside coalesce). Route through to_jsonb so a
-- missing key just resolves to null instead of erroring.

create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_id uuid;
begin
  resolved_id := coalesce(
    (to_jsonb(new)->>'id')::uuid,
    (to_jsonb(old)->>'id')::uuid,
    (to_jsonb(new)->>'person_id')::uuid,
    (to_jsonb(old)->>'person_id')::uuid
  );

  insert into public.audit_log (table_name, record_id, operation, actor_user_id, old_values, new_values)
  values (
    tg_table_name,
    resolved_id,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;
