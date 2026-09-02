-- File storage for candidates, firms and jobs - candidate_profiles has
-- carried an unused cv_storage_path column since the very first
-- migration, anticipating exactly this. One private bucket, one
-- metadata table (subject_type/subject_id polymorphic, matching the
-- activities/tasks pattern), RLS mirrors people/firms/jobs exactly
-- (recruiter/admin only - resumes and firm documents are at least as
-- sensitive as the records they're attached to).

insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false);

create table file_attachments (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('people', 'firms', 'jobs')),
  subject_id uuid not null,
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index file_attachments_subject_idx on file_attachments(subject_type, subject_id, created_at desc);

alter table file_attachments enable row level security;

create policy "file_attachments_recruiter_admin_all" on file_attachments for all
  to authenticated
  using (current_app_role() in ('admin', 'recruiter'))
  with check (current_app_role() in ('admin', 'recruiter'));

-- Storage RLS: same recruiter/admin gate, scoped to this one bucket so
-- it never touches any other bucket added later for a different purpose.
create policy "attachments_bucket_recruiter_admin_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'attachments' and public.current_app_role() in ('admin', 'recruiter'));

create policy "attachments_bucket_recruiter_admin_insert" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'attachments' and public.current_app_role() in ('admin', 'recruiter'));

create policy "attachments_bucket_recruiter_admin_delete" on storage.objects for delete
  to authenticated
  using (bucket_id = 'attachments' and public.current_app_role() in ('admin', 'recruiter'));
