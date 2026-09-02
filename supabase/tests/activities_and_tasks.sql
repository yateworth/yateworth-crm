-- Stage 2 assertions (docs/crm-functionality-plan.md). Wrapped in
-- BEGIN/ROLLBACK. Run with: node scripts/run-remote-sql.cjs supabase/tests/activities_and_tasks.sql

begin;

-- SET LOCAL ROLE is required, not just the jwt claim - the Management
-- API executes as `postgres`, which has BYPASSRLS. Without this, every
-- direct-table RLS check below would silently pass regardless of the
-- actual policy, since the role running the query ignores RLS entirely.
-- (Verified live: `select rolbypassrls from pg_roles where rolname =
-- current_user` returns true for `postgres`, false for `authenticated`.)
-- SECURITY DEFINER function calls (create_candidate, etc.) are
-- unaffected either way - they execute as the function owner regardless
-- of the caller's role.
set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
  v_person_id uuid;
  v_activity_id uuid;
  v_task_id uuid;
begin
  v_person_id := create_candidate('Act', 'Ivitytest', 'act.ivitytest@example-seed.test');

  -- 1. can insert an activity against a candidate
  insert into activities (activity_type, subject_type, subject_id, body, created_by)
  values ('note', 'people', v_person_id, 'Had a good first call.', auth.uid())
  returning id into v_activity_id;

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (select 1 from activities where id = v_activity_id and body = 'Had a good first call.')
    then 'PASS 1: activity insert succeeds and is readable'
    else 'FAIL 1: activity was not created/readable' end);

  -- 2. activities has no UPDATE RLS policy for any client role - even
  -- the row's own creator cannot edit it after the fact. An RLS-blocked
  -- UPDATE affects zero rows silently rather than raising - it does NOT
  -- throw an exception - so this checks the actual row content
  -- afterward rather than trying to catch an error that won't occur.
  v_seq := v_seq + 1;
  update activities set body = 'edited' where id = v_activity_id;
  insert into test_results values (v_seq,
    case when (select body from activities where id = v_activity_id) = 'Had a good first call.'
    then 'PASS 2: activities cannot be updated (append-only) - the update silently affected 0 rows'
    else 'FAIL 2: an activity was updated - should be append-only' end);

  -- 3. tasks: create, assign to self, mark complete
  insert into tasks (title, subject_type, subject_id, assigned_to, due_at, created_by)
  values ('Send salary benchmark', 'people', v_person_id, auth.uid(), now() + interval '1 day', auth.uid())
  returning id into v_task_id;

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (select 1 from tasks where id = v_task_id and status = 'open')
    then 'PASS 3: task created with open status'
    else 'FAIL 3: task not created correctly' end);

  update tasks set status = 'completed', completed_at = now() where id = v_task_id;

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select status from tasks where id = v_task_id) = 'completed'
      and (select completed_at from tasks where id = v_task_id) is not null
    then 'PASS 4: task can be marked completed'
    else 'FAIL 4: task completion did not update correctly' end);

  -- 5. querying activities for a subject returns them ordered by
  -- occurred_at desc (the pattern the detail-page feed will use)
  insert into activities (activity_type, subject_type, subject_id, body, occurred_at, created_by)
  values ('note', 'people', v_person_id, 'Second, more recent note.', now() + interval '1 hour', auth.uid());

  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (
      select body from activities where subject_type = 'people' and subject_id = v_person_id
      order by occurred_at desc limit 1
    ) = 'Second, more recent note.'
    then 'PASS 5: most recent activity sorts first'
    else 'FAIL 5: activity ordering is wrong' end);
end $$;

select * from test_results order by seq;

rollback;
