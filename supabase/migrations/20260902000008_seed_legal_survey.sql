-- Real application data (the actual survey definition), not a test
-- fixture, so it belongs in a migration rather than supabase/seed/ -
-- every environment needs this row to exist, including production.
--
-- Matches survey-form.html on the marketing site question-for-question.
-- Status starts 'draft' so it is not reachable via get_active_survey()
-- until deliberately flipped to 'open':
--   update surveys set status = 'open' where slug = 'australian-legal-survey';
-- Pay bands are still the site's own placeholder text ([band N — set
-- range]) because the real ranges haven't been set yet - same open item
-- flagged in the marketing site's README.

insert into surveys (slug, title, status)
values ('australian-legal-survey', 'The Australian Legal Survey', 'draft');

with s as (select id from surveys where slug = 'australian-legal-survey')
insert into survey_questions (survey_id, question_key, question_text, question_type, position, required)
select s.id, v.question_key, v.question_text, v.question_type, v.position, false
from s, (values
  ('state', 'Where do you practise?', 'single_choice', 1),
  ('role', 'What is your role?', 'single_choice', 2),
  ('area', 'What is your main practice area?', 'single_choice', 3),
  ('req', 'Days a week you are required in the office', 'single_choice', 4),
  ('act', 'Days a week you actually attend', 'single_choice', 5),
  ('target', 'Can you meet your billable target in ordinary hours?', 'single_choice', 6),
  ('hours', 'Hours you work in an average week', 'single_choice', 7),
  ('pay', 'Total remuneration, including super and bonus', 'single_choice', 8),
  ('stay', 'How likely are you to still be there in 12 months?', 'single_choice', 9),
  ('comment', 'What is one thing your firm could change that would make you stay?', 'text', 10)
) as v(question_key, question_text, question_type, position);

insert into survey_options (question_id, option_value, option_label, position)
select q.id, v.option_value, v.option_label, v.position
from survey_questions q
join surveys s on s.id = q.survey_id and s.slug = 'australian-legal-survey'
join (values
  ('state', 'NSW', 'NSW', 1), ('state', 'VIC', 'VIC', 2), ('state', 'QLD', 'QLD', 3),
  ('state', 'WA', 'WA', 4), ('state', 'SA', 'SA', 5), ('state', 'TAS', 'TAS', 6),
  ('state', 'ACT', 'ACT', 7), ('state', 'NT', 'NT', 8),

  ('role', 'Clerk/paralegal', 'Law clerk or paralegal', 1),
  ('role', 'Support', 'Legal secretary or support staff', 2),
  ('role', 'Graduate', 'Graduate or first-year lawyer', 3),
  ('role', 'Lawyer', 'Lawyer or solicitor', 4),
  ('role', 'SA', 'Associate or senior associate', 5),
  ('role', 'Special counsel', 'Special counsel', 6),
  ('role', 'Partner', 'Partner, principal or director', 7),
  ('role', 'In-house', 'In-house counsel or head of legal', 8),

  ('area', 'Property', 'Property, conveyancing and leasing', 1),
  ('area', 'Family', 'Family law', 2),
  ('area', 'PI/insurance', 'Personal injury, insurance and compensation', 3),
  ('area', 'Commercial', 'Commercial, corporate and M&A', 4),
  ('area', 'Litigation', 'Commercial litigation and disputes', 5),
  ('area', 'Estates', 'Wills, estates and succession', 6),
  ('area', 'Employment', 'Employment and industrial relations', 7),
  ('area', 'Criminal', 'Criminal law', 8),
  ('area', 'Mixed', 'General practice or mixed', 9),
  ('area', 'Other', 'Something else', 10),

  ('req', '0', '0', 1), ('req', '1', '1', 2), ('req', '2', '2', 3),
  ('req', '3', '3', 4), ('req', '4', '4', 5), ('req', '5', '5', 6),
  ('req', 'none', 'No requirement', 7),

  ('act', '0', '0', 1), ('act', '1', '1', 2), ('act', '2', '2', 3),
  ('act', '3', '3', 4), ('act', '4', '4', 5), ('act', '5', '5', 6),

  ('target', 'No target', 'I don''t have a target', 1),
  ('target', 'Usually', 'Yes, usually', 2),
  ('target', 'Sometimes', 'Sometimes', 3),
  ('target', 'Rarely', 'Rarely', 4),
  ('target', 'Never', 'Never', 5),

  ('hours', '<38', 'Under 38', 1), ('hours', '38-42', '38-42', 2),
  ('hours', '43-47', '43-47', 3), ('hours', '48-52', '48-52', 4),
  ('hours', '53-60', '53-60', 5), ('hours', '60+', '60+', 6),

  ('pay', 'b1', '[band 1 — set range]', 1), ('pay', 'b2', '[band 2 — set range]', 2),
  ('pay', 'b3', '[band 3 — set range]', 3), ('pay', 'b4', '[band 4 — set range]', 4),
  ('pay', 'b5', '[band 5 — set range]', 5), ('pay', 'b6', '[band 6 — set range]', 6),
  ('pay', 'b7', '[band 7 — set range]', 7), ('pay', 'b8', '[band 8 — set range]', 8),
  ('pay', 'skip', 'Prefer not to say', 9),

  ('stay', 'Very likely', 'Very likely', 1), ('stay', 'Likely', 'Likely', 2),
  ('stay', 'Unsure', 'Unsure', 3), ('stay', 'Unlikely', 'Unlikely', 4),
  ('stay', 'Very unlikely', 'Very unlikely', 5)
) as v(question_key, option_value, option_label, position)
  on v.question_key = q.question_key;
