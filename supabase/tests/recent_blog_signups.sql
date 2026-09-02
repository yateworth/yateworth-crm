-- Recent blog signups assertions (migration 29).
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/recent_blog_signups.sql

begin;

create temporary table test_results (seq int, result text) on commit drop;
grant select, insert on test_results to authenticated;

do $$
declare
  v_email_id uuid;
begin
  insert into email_addresses (email) values ('recent-signup-test@example.com') returning id into v_email_id;
  insert into communication_preferences (email_address_id, purpose, status, kind, source)
  values (v_email_id, 'blog', 'opted_in', 'ongoing', 'test setup');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

do $$
declare
  v_seq int := 0;
begin
  -- 1. an authorised caller sees the seeded signup
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when exists (
      select 1 from recent_blog_signups(20) where email = 'recent-signup-test@example.com'
    ) then 'PASS 1: recent_blog_signups returns the seeded signup'
    else 'FAIL 1: the seeded signup was not returned' end);

  -- 2. the limit parameter is respected
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select count(*) from recent_blog_signups(1)) <= 1
    then 'PASS 2: the limit parameter is respected'
    else 'FAIL 2: more rows than the limit were returned' end);
end $$;

-- 3. an unauthorised caller is rejected
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
do $$
begin
  perform recent_blog_signups(5);
  insert into test_results values (3, 'FAIL 3: an unauthorised caller received recent signups');
exception when others then
  insert into test_results values (3, 'PASS 3: recent_blog_signups rejects an unauthorised caller');
end $$;

select * from test_results order by seq;

rollback;
