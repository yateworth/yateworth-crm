-- Fix, per direct feedback: "won" was read from whether a placement
-- record existed, not from job status - so marking a job 'filled'
-- didn't show it as won until a placement was also recorded separately,
-- which read as a bug ("the job is filled and it's not showing won").
-- "Won" now comes straight from status = 'filled', matching the same
-- status meaning already used everywhere else (StatusBadge's
-- jobStatusTone already treats 'filled' as the success tone). The fee
-- amount still comes from a placement when one exists - a won job with
-- no placement recorded yet just shows no fee, rather than blocking the
-- "won" signal on that separate step.

create or replace function jobs_pipeline_dashboard()
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
          (j.status = 'filled') as won,
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
      'won_count', (select count(*) from jobs where status = 'filled'),
      'won_fee_total', (
        select coalesce(sum(pl.fee_amount), 0)
        from jobs j
        left join lateral (
          select p.fee_amount
          from submissions s
          join placements p on p.submission_id = s.id
          where s.job_id = j.id
          order by p.created_at desc
          limit 1
        ) pl on true
        where j.status = 'filled'
      )
    )
  );
end;
$$;
