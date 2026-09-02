-- Recent newsletter/blog sign-ups for the dashboard. communication_
-- preferences itself stays admin-only SELECT (migration 5) - this is a
-- narrow, controlled read path exposing just enough for the dashboard
-- widget, matching the same shape as survey_aggregate_report() and
-- insights_dashboard(): a function widens who can see a summary of
-- sensitive data without opening the raw table to that role.
--
-- admin/recruiter (not marketing) since this sits on the same
-- recruiter-facing dashboard as the jobs pipeline and insights widgets,
-- not the marketing reporting screens.

create function recent_blog_signups(p_limit int default 5)
returns table(email_address_id uuid, email citext, person_id uuid, effective_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'recruiter') then
    raise exception 'not authorised';
  end if;

  return query
    select cp.email_address_id, ea.email, ea.person_id, cp.effective_at
    from communication_preferences cp
    join email_addresses ea on ea.id = cp.email_address_id
    where cp.purpose = 'blog' and cp.status = 'opted_in'
    order by cp.effective_at desc
    limit p_limit;
end;
$$;

grant execute on function recent_blog_signups(int) to authenticated;
