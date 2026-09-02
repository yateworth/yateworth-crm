-- Jobs pipeline summary for the dashboard: open jobs with their
-- estimated value (fee_percent against salary - the actual fee isn't
-- known until a placement exists), and closed jobs with whether they
-- were won (a placement exists) and the real fee from it. admin/
-- recruiter only, matching jobs/placements RLS exactly.
--
-- "Open" = draft/open/on_hold (still active); "closed" = filled/closed/
-- cancelled (done, one way or another) - won-ness is read from whether
-- a placement actually exists, not from status alone, since "filled"
-- vs "closed" isn't a reliable enough signal on its own and this way
-- the number always matches what's on the Placements page.

create function jobs_pipeline_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if current_app_role() is null or current_app_role() not in ('admin', 'recruiter') then
    raise exception 'not authorised';
  end if;

  return jsonb_build_object(
    'open_jobs', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.opened_at asc nulls last), '[]'::jsonb)
      from (
        select
          j.id as job_id, j.title, f.name as firm_name, j.status, j.opened_at,
          case
            when j.fee_percent is not null and coalesce(j.salary_max, j.salary_min) is not null
            then round(j.fee_percent / 100 * coalesce(j.salary_max, j.salary_min), 2)
            else null
          end as estimated_value
        from jobs j
        join firms f on f.id = j.firm_id
        where j.status in ('draft', 'open', 'on_hold')
      ) t
    ),
    'closed_jobs', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.closed_at desc nulls last), '[]'::jsonb)
      from (
        select
          j.id as job_id, j.title, f.name as firm_name, j.status, j.closed_at,
          pl.fee_amount is not null as won,
          pl.fee_amount
        from jobs j
        join firms f on f.id = j.firm_id
        left join lateral (
          select p.fee_amount
          from submissions s
          join placements p on p.submission_id = s.id
          where s.job_id = j.id
          order by p.created_at desc
          limit 1
        ) pl on true
        where j.status in ('filled', 'closed', 'cancelled')
      ) t
    ),
    'totals', jsonb_build_object(
      'open_count', (select count(*) from jobs where status in ('draft', 'open', 'on_hold')),
      'open_estimated_value', (
        select coalesce(sum(round(fee_percent / 100 * coalesce(salary_max, salary_min), 2)), 0)
        from jobs
        where status in ('draft', 'open', 'on_hold')
          and fee_percent is not null and coalesce(salary_max, salary_min) is not null
      ),
      'closed_count', (select count(*) from jobs where status in ('filled', 'closed', 'cancelled')),
      'won_count', (
        select count(distinct j.id)
        from jobs j
        join submissions s on s.job_id = j.id
        join placements p on p.submission_id = s.id
        where j.status in ('filled', 'closed', 'cancelled')
      ),
      'won_fee_total', (
        select coalesce(sum(p.fee_amount), 0)
        from jobs j
        join submissions s on s.job_id = j.id
        join placements p on p.submission_id = s.id
        where j.status in ('filled', 'closed', 'cancelled')
      )
    )
  );
end;
$$;

grant execute on function jobs_pipeline_dashboard() to authenticated;
