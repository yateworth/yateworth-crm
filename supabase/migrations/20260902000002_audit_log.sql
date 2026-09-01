-- Phase 0: generic audit trigger, applied to profiles now and to every
-- sensitive table (candidates, submissions, permissions, suppressions,
-- exports) as those tables are introduced in later migrations.

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id uuid references profiles(id),
  old_values jsonb,
  new_values jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_log_table_record_idx on audit_log(table_name, record_id, occurred_at desc);

alter table audit_log enable row level security;

create policy "audit_log_admin_select"
  on audit_log for select
  to authenticated
  using (current_app_role() = 'admin');

-- No insert/update/delete policy for any client role: rows are written
-- only by the audit_row_change trigger function below (security definer).

create function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (table_name, record_id, operation, actor_user_id, old_values, new_values)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

create trigger profiles_audit
  after insert or update or delete on profiles
  for each row execute function audit_row_change();

-- Updates/deletes on audit_log itself are restricted to the Postgres
-- owner role (no application role, including admin, can rewrite history).
revoke update, delete on audit_log from authenticated, anon;
