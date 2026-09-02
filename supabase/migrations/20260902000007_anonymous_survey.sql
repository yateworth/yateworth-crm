-- Phase 1, Milestone 3: the anonymous survey and a separate report/
-- permission endpoint. The core guarantee this migration exists to prove:
-- survey_responses and survey_answers carry no email, person, candidate
-- or report_request identifier, ever - by schema, not just by policy.
--
-- Both public entry points are SECURITY DEFINER functions granted to the
-- anon role, per the spec's RLS section: "Public anonymous users may
-- submit only through narrow server-side functions that validate the
-- survey schema" - the tables themselves stay closed to direct client
-- reads/writes, including from anon.

create table surveys (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  question_key text not null,
  question_text text not null,
  question_type text not null check (question_type in ('single_choice', 'text')),
  position integer not null,
  required boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  unique(survey_id, question_key),
  unique(survey_id, position)
);

create table survey_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references survey_questions(id) on delete cascade,
  option_value text not null,
  option_label text not null,
  position integer not null,
  unique(question_id, option_value)
);

-- No email_address_id, person_id, candidate reference, or campaign
-- recipient id on this table or survey_answers, ever. That is the whole
-- point of this table existing separately from report_requests below.
create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete restrict,
  response_token_hash text not null unique,
  status text not null default 'complete',
  broad_source text,
  submitted_at timestamptz not null default now()
);

create table survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references survey_responses(id) on delete cascade,
  question_id uuid not null references survey_questions(id) on delete restrict,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  unique(response_id, question_id)
);

-- No response_id / survey_responses reference here either - this table
-- exists purely so a delivered report can be tracked, not so a report
-- request can be traced back to a survey answer.
create table report_requests (
  id uuid primary key default gen_random_uuid(),
  email_address_id uuid not null references email_addresses(id) on delete restrict,
  report_code text not null,
  requested_at timestamptz not null default now(),
  delivered_at timestamptz,
  status text not null default 'requested',
  source text,
  unique(email_address_id, report_code)
);

create index survey_answers_response_idx on survey_answers(response_id);

alter table surveys enable row level security;
alter table survey_questions enable row level security;
alter table survey_options enable row level security;
alter table survey_responses enable row level security;
alter table survey_answers enable row level security;
alter table report_requests enable row level security;

-- Direct table access: admin only, everywhere. Everyone else - including
-- anon, and including recruiter/marketing - goes through the functions
-- below. Marketing's aggregate reporting view (with minimum-cohort
-- suppression) is a Milestone 6 deliverable, not a raw table grant.
create policy "surveys_admin_select" on surveys for select to authenticated using (current_app_role() = 'admin');
create policy "survey_questions_admin_select" on survey_questions for select to authenticated using (current_app_role() = 'admin');
create policy "survey_options_admin_select" on survey_options for select to authenticated using (current_app_role() = 'admin');
create policy "survey_responses_admin_select" on survey_responses for select to authenticated using (current_app_role() = 'admin');
create policy "survey_answers_admin_select" on survey_answers for select to authenticated using (current_app_role() = 'admin');
create policy "report_requests_admin_select" on report_requests for select to authenticated using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------
-- get_active_survey: the only way anon (or staff) reads a survey's shape.
-- Returns null if the slug doesn't exist or isn't currently open, so a
-- draft/future/closed survey is never exposed by guessing a slug.
-- ---------------------------------------------------------------------
create function get_active_survey(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', s.slug,
    'title', s.title,
    'version', s.version,
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', q.question_key,
        'text', q.question_text,
        'type', q.question_type,
        'required', q.required,
        'settings', q.settings,
        'options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'value', o.option_value, 'label', o.option_label
          ) order by o.position), '[]'::jsonb)
          from survey_options o where o.question_id = q.id
        )
      ) order by q.position), '[]'::jsonb)
      from survey_questions q where q.survey_id = s.id
    )
  )
  from surveys s
  where s.slug = p_slug
    and s.status = 'open'
    and (s.opens_at is null or s.opens_at <= now())
    and (s.closes_at is null or s.closes_at >= now());
$$;

grant execute on function get_active_survey(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- submit_survey_response: the only way a survey answer is ever recorded.
-- p_answers is {question_key: answer_value}. Validates every key is a
-- real question on this survey, every required question is present, and
-- every single_choice answer matches a defined option - then writes the
-- response with no identifying information whatsoever.
-- ---------------------------------------------------------------------
create function submit_survey_response(
  p_slug text,
  p_answers jsonb,
  p_broad_source text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey surveys%rowtype;
  v_question survey_questions%rowtype;
  v_response_id uuid;
  v_key text;
  v_value jsonb;
begin
  select * into v_survey from surveys
  where slug = p_slug and status = 'open'
    and (opens_at is null or opens_at <= now())
    and (closes_at is null or closes_at >= now());

  if not found then
    raise exception 'survey % is not open', p_slug using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'answers must be a JSON object' using errcode = 'P0001';
  end if;

  -- every required question must be present with a non-empty value
  for v_question in select * from survey_questions where survey_id = v_survey.id and required loop
    if not (p_answers ? v_question.question_key)
       or jsonb_typeof(p_answers -> v_question.question_key) = 'null' then
      raise exception 'question % is required', v_question.question_key using errcode = 'P0001';
    end if;
  end loop;

  -- every submitted key must be a real question on this survey, and
  -- single_choice answers must match a defined option
  for v_key, v_value in select * from jsonb_each(p_answers) loop
    select * into v_question from survey_questions
    where survey_id = v_survey.id and question_key = v_key;

    if not found then
      raise exception 'unknown question key: %', v_key using errcode = 'P0001';
    end if;

    if v_question.question_type = 'single_choice'
       and not exists (
         select 1 from survey_options
         where question_id = v_question.id and option_value = (v_value #>> '{}')
       ) then
      raise exception 'invalid option for %: %', v_key, v_value using errcode = 'P0001';
    end if;
  end loop;

  insert into survey_responses (survey_id, response_token_hash, broad_source)
  values (
    v_survey.id,
    encode(digest(gen_random_uuid()::text || clock_timestamp()::text, 'sha256'), 'hex'),
    p_broad_source
  )
  returning id into v_response_id;

  for v_key, v_value in select * from jsonb_each(p_answers) loop
    select * into v_question from survey_questions
    where survey_id = v_survey.id and question_key = v_key;

    insert into survey_answers (response_id, question_id, answer)
    values (v_response_id, v_question.id, v_value);
  end loop;
end;
$$;

grant execute on function submit_survey_response(text, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- apply_permission_preference: internal helper (not granted to anon —
-- only submit_permission_request below calls it, and a SECURITY DEFINER
-- function's owner can always call another function it owns).
--
-- An existing opted_out preference is never silently flipped back to
-- opted_in by a form resubmission - a checked box on a public form
-- isn't "sufficient evidence" to override a prior explicit opt-out. A
-- fresh opted_in clears fulfilled_at, so re-requesting a single-use
-- report after it was already delivered starts a new fulfilment cycle
-- instead of staying silently blocked.
-- ---------------------------------------------------------------------
create function apply_permission_preference(
  p_email_id uuid,
  p_purpose permission_purpose,
  p_kind permission_kind,
  p_source text,
  p_evidence jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current preference_status;
begin
  select status into v_current from communication_preferences
  where email_address_id = p_email_id and purpose = p_purpose;

  if v_current = 'opted_out' then
    insert into consent_events (email_address_id, purpose, event_type, previous_status, new_status, source, evidence)
    values (p_email_id, p_purpose, 'resubmission_ignored', v_current, v_current, p_source, p_evidence);
    return;
  end if;

  insert into communication_preferences (email_address_id, purpose, status, kind, source, evidence)
  values (p_email_id, p_purpose, 'opted_in', p_kind, p_source, p_evidence)
  on conflict (email_address_id, purpose)
    do update set
      status = 'opted_in',
      kind = excluded.kind,
      source = p_source,
      evidence = p_evidence,
      effective_at = now(),
      fulfilled_at = null;

  insert into consent_events (email_address_id, purpose, event_type, previous_status, new_status, source, evidence)
  values (p_email_id, p_purpose, 'opt_in', v_current, 'opted_in', p_source, p_evidence);
end;
$$;

-- ---------------------------------------------------------------------
-- submit_permission_request: the report/blog/recruitment endpoint.
-- Deliberately takes no relation to any survey_responses row - it is
-- called as a second, independent request from the same page, exactly
-- as the site's privacy copy already promises.
-- ---------------------------------------------------------------------
create function submit_permission_request(
  p_email text,
  p_report boolean default false,
  p_blog boolean default false,
  p_recruitment boolean default false,
  p_report_code text default 'legal_survey_report',
  p_source text default 'website_form',
  p_form_version text default 'v1'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email citext;
  v_email_id uuid;
  v_evidence jsonb;
begin
  if not (p_report or p_blog or p_recruitment) then
    return;
  end if;

  v_email := normalise_email(p_email);
  v_evidence := jsonb_build_object('form_version', p_form_version, 'submitted_at', now());

  insert into email_addresses (email) values (v_email)
  on conflict (email) do nothing;
  select id into v_email_id from email_addresses where email = v_email;

  if p_report then
    perform apply_permission_preference(v_email_id, 'report', 'single_use', p_source, v_evidence);
    insert into report_requests (email_address_id, report_code, source)
    values (v_email_id, p_report_code, p_source)
    on conflict (email_address_id, report_code)
      do update set requested_at = now(), status = 'requested', delivered_at = null;
  end if;

  if p_blog then
    perform apply_permission_preference(v_email_id, 'blog', 'ongoing', p_source, v_evidence);
  end if;

  if p_recruitment then
    perform apply_permission_preference(v_email_id, 'recruitment', 'ongoing', p_source, v_evidence);
  end if;
end;
$$;

grant execute on function submit_permission_request(text, boolean, boolean, boolean, text, text, text) to anon, authenticated;
