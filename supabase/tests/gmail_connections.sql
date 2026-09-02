-- Confirms gmail_connections is invisible and unwritable from every
-- client role, including admin - this table holds OAuth tokens (the key
-- to someone's actual inbox), so it's deliberately locked down harder
-- than anything else in the database. Only Netlify functions (service
-- role) should ever touch it - that path can't be exercised from this
-- SQL test channel, so this file only proves the client-role side.
--
-- set local role authenticated is required - see the README's "A
-- testing gap, found and fixed" section.
--
-- Run with: node scripts/run-remote-sql.cjs supabase/tests/gmail_connections.sql

begin;

set local role authenticated;
-- impersonate the real admin - if even admin can't touch this table,
-- weaker roles certainly can't either
select set_config('request.jwt.claim.sub', '0cb3064c-f944-4648-b0e5-e2e49ec4f015', true);

create temporary table test_results (seq int, result text) on commit drop;

do $$
declare
  v_seq int := 0;
begin
  v_seq := v_seq + 1;
  insert into test_results values (v_seq,
    case when (select count(*) from gmail_connections) = 0
    then 'PASS 1: gmail_connections is invisible even to admin'
    else 'FAIL 1: gmail_connections rows were visible to admin' end);

  v_seq := v_seq + 1;
  begin
    insert into gmail_connections (profile_id, google_email, access_token, refresh_token, token_expires_at)
    values ('0cb3064c-f944-4648-b0e5-e2e49ec4f015', 'test@example.com', 'x', 'x', now());
    insert into test_results values (v_seq, 'FAIL 2: admin was able to insert a gmail_connections row directly');
  exception when others then
    insert into test_results values (v_seq, 'PASS 2: admin insert correctly rejected - no policy permits it');
  end;
end $$;

select * from test_results order by seq;

rollback;
