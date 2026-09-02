-- Rules-based insights panel: no external AI, no ongoing cost, nothing
-- ever leaves the database - plain queries surfacing what's gone quiet
-- across candidates, jobs and firms. Chosen over an LLM-powered version
-- specifically to keep candidate/firm data (names, salaries, notes)
-- inside this database rather than sending it to an external API on
-- every dashboard load.
--
-- admin/recruiter only - the same audience as the candidate/firm/job
-- records these queries surface, not marketing (who has no access to
-- any of these tables at all - see migration 3/18's own role comments).

create function insights_dashboard(
  p_stale_contact_days int default 30,
  p_stale_job_days int default 45,
  p_dormant_firm_days int default 60
)
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
    'stale_candidates', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select p.id as person_id, p.first_name || ' ' || p.last_name as name, cpf.last_contacted_at
        from people p
        join candidate_profiles cpf on cpf.person_id = p.id
        where p.status = 'active'
          and cpf.candidate_status in ('prospective', 'active')
          and (
            cpf.last_contacted_at is null
            or cpf.last_contacted_at < now() - (p_stale_contact_days || ' days')::interval
          )
        order by cpf.last_contacted_at asc nulls first
        limit 10
      ) t
    ),
    'stale_jobs', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select j.id as job_id, j.title, f.name as firm_name, j.opened_at
        from jobs j
        join firms f on f.id = j.firm_id
        left join submissions sub on sub.job_id = j.id
        where j.status = 'open'
          and j.opened_at is not null
          and j.opened_at < now() - (p_stale_job_days || ' days')::interval
        group by j.id, j.title, f.name, j.opened_at
        having count(sub.id) = 0
        order by j.opened_at asc
        limit 10
      ) t
    ),
    'dormant_firms', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      from (
        select f.id as firm_id, f.name, f.relationship_stage, act.last_activity_at
        from firms f
        left join lateral (
          select max(a.occurred_at) as last_activity_at
          from activities a
          where a.subject_type = 'firms' and a.subject_id = f.id
        ) act on true
        where f.status = 'active'
          and f.relationship_stage in ('contacted', 'terms_sent', 'terms_signed')
          and f.created_at < now() - (p_dormant_firm_days || ' days')::interval
          and (
            act.last_activity_at is null
            or act.last_activity_at < now() - (p_dormant_firm_days || ' days')::interval
          )
        order by coalesce(act.last_activity_at, f.created_at) asc
        limit 10
      ) t
    )
  );
end;
$$;

grant execute on function insights_dashboard(int, int, int) to authenticated;
