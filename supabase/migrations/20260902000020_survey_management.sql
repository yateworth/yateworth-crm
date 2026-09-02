-- Stage 4 (docs/crm-functionality-plan.md): making the survey section
-- its own clickable page instead of a dashboard widget.
--
-- surveys/survey_questions/survey_options only have an admin-only SELECT
-- policy (migration 7) - marketing already gets aggregate reporting via
-- survey_aggregate_report(), so a list-surveys function keeps the same
-- minimal-privilege shape (marketing sees summaries through a function,
-- never raw table access) rather than widening the table policy.

create function list_surveys()
returns table(slug text, title text, status text, opens_at timestamptz, closes_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'marketing') then
    raise exception 'not authorised';
  end if;

  return query
    select s.slug, s.title, s.status, s.opens_at, s.closes_at
    from surveys s
    order by s.created_at desc;
end;
$$;

grant execute on function list_surveys() to authenticated;

-- Opening/closing a survey is an admin-level decision (it controls
-- public reachability via get_active_survey()), so this is admin-only,
-- unlike the read-only reporting functions above.
create function set_survey_status(p_slug text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_app_role() is null or current_app_role() <> 'admin' then
    raise exception 'not authorised';
  end if;

  if p_status not in ('draft', 'open', 'closed') then
    raise exception 'invalid survey status: %', p_status using errcode = 'P0001';
  end if;

  update surveys set status = p_status where slug = p_slug;
  if not found then
    raise exception 'survey not found: %', p_slug using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function set_survey_status(text, text) to authenticated;
