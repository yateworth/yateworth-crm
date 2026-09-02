-- File attachments assertions (migration 26).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/file_attachments.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
create temporary table test_ids (person_id uuid) on commit drop;
grant select, insert on test_results to authenticated;
grant select on test_ids to authenticated;

do $$
declare
  v_person_id uuid;
begin
  insert into people (first_name, last_name, status) values ('File', 'Test', 'active') returning id into v_person_id;
  insert into test_ids (person_id) values (v_person_id);
end $$;

-- 1. the attachments bucket exists and is private
insert into test_results
  select 1, case when exists (select 1 from storage.buckets where id = 'attachments' and public = false)
    then 'PASS 1: the attachments bucket exists and is private'
    else 'FAIL 1: the attachments bucket is missing or public' end;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

do $$
declare
  v_seq int := 1;
  v_person_id uuid;
  v_attachment_id uuid;
begin
  select person_id into v_person_id from test_ids;

  -- 2. recruiter/admin can record a file_attachments row
  insert into file_attachments (subject_type, subject_id, storage_path, file_name, content_type, size_bytes)
  values ('people', v_person_id, 'people/' || v_person_id || '/test.pdf', 'test.pdf', 'application/pdf', 1024)
  returning id into v_attachment_id;
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when v_attachment_id is not null then 'PASS 2: recruiter/admin can record a file attachment'
    else 'FAIL 2: insert did not return an id' end);

  -- 3. recruiter/admin can insert a matching storage.objects row (simulating an upload)
  v_seq := v_seq + 1;
  begin
    insert into storage.objects (bucket_id, name) values ('attachments', 'people/' || v_person_id || '/test.pdf');
    insert into test_results values (v_seq, 'PASS 3: recruiter/admin can write to the attachments bucket');
  exception when others then
    insert into test_results values (v_seq, format('FAIL 3: %s', sqlerrm));
  end;

  -- 4. an invalid subject_type is rejected
  v_seq := v_seq + 1;
  begin
    insert into file_attachments (subject_type, subject_id, storage_path, file_name)
    values ('not_a_real_type', v_person_id, 'bogus/path.pdf', 'bogus.pdf');
    insert into test_results values (v_seq, 'FAIL 4: an invalid subject_type was accepted');
  exception when others then
    insert into test_results values (v_seq, 'PASS 4: an invalid subject_type is rejected');
  end;
end $$;

-- 5. an unrecognised caller cannot read file_attachments or the bucket's objects
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
insert into test_results
  select 5, case when (select count(*) from file_attachments) = 0 and (select count(*) from storage.objects where bucket_id = 'attachments') = 0
    then 'PASS 5: an unrecognised caller sees no attachments or objects'
    else 'FAIL 5: an unrecognised caller could read attachments or objects' end;

select * from test_results order by seq;

rollback;
