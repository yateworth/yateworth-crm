-- Phase 0: extensions, shared enums, and the profiles/roles table that
-- every later RLS policy depends on.

create extension if not exists pgcrypto;
create extension if not exists citext;

create type app_role as enum ('admin', 'recruiter', 'marketing', 'viewer');
create type record_status as enum ('active', 'archived');

-- ---------------------------------------------------------------------
-- updated_at housekeeping, reused by every mutable table in later phases
-- ---------------------------------------------------------------------
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles: one row per staff member, linked 1:1 to auth.users
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null default 'viewer',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- New auth users get a profile row automatically, but with no access:
-- role defaults to 'viewer' and active defaults to false. An existing
-- admin must review and activate the account with the correct role.
-- This means there is no path from "created a Supabase Auth account" to
-- "has CRM access" without an explicit admin action.
create function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'viewer', false);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table profiles enable row level security;

-- Helper used throughout this and later migrations: the calling user's
-- own role, or null if they have no profile (e.g. the anonymous role).
create function current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

create policy "profiles_self_select"
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_admin_select"
  on profiles for select
  to authenticated
  using (current_app_role() = 'admin');

create policy "profiles_admin_update"
  on profiles for update
  to authenticated
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

-- Deliberately no insert/delete policy for any client role: profile rows
-- are created only by the handle_new_auth_user trigger (security definer)
-- and deletion cascades from auth.users, both of which bypass RLS.
