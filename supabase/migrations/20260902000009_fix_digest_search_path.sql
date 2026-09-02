-- Fix: submit_survey_response calls digest() (from pgcrypto), but
-- Supabase installs pgcrypto into the `extensions` schema, not `public`.
-- SECURITY DEFINER functions here deliberately pin search_path to guard
-- against search_path injection, which meant digest() couldn't be found.
-- Add `extensions` to the search path rather than loosening it further.

create or replace function submit_survey_response(
  p_slug text,
  p_answers jsonb,
  p_broad_source text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
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

  for v_question in select * from survey_questions where survey_id = v_survey.id and required loop
    if not (p_answers ? v_question.question_key)
       or jsonb_typeof(p_answers -> v_question.question_key) = 'null' then
      raise exception 'question % is required', v_question.question_key using errcode = 'P0001';
    end if;
  end loop;

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
