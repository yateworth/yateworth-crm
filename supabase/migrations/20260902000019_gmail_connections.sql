-- Gmail sync, step 1 (docs plan: "Gmail sync" section). Holds OAuth
-- tokens - the key to someone's actual inbox, more sensitive than
-- anything else in this database so far. No SELECT/INSERT/UPDATE/DELETE
-- policy for any client role at all, not even admin: only Netlify
-- functions (service role) ever touch this table, the same pattern as
-- record_unsubscribe/process_email_event in migration 12. RLS is
-- enabled purely so a future policy has to be added deliberately -
-- right now the table is invisible and unwritable from every client
-- role by construction (no policies exist for any operation).

create table gmail_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles(id) on delete cascade,
  google_email citext not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  last_synced_at timestamptz,
  last_history_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger gmail_connections_set_updated_at before update on gmail_connections
  for each row execute function set_updated_at();

alter table gmail_connections enable row level security;

-- Deliberately no policies: default deny for every operation, every role.
