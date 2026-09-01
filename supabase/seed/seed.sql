-- Fictional seed data only. No real firms, people or email addresses.
-- Run against local/dev Supabase projects only — never against production.

insert into firms (name, legal_name, website, main_phone, practice_areas, size_band, status)
values
  ('Fictional & Co', 'Fictional & Co Pty Ltd', 'https://example.com/fictional', '+61 2 5550 1000',
    array['Corporate and M&A', 'Banking and finance'], '50-100 lawyers', 'active'),
  ('Sample Partners', 'Sample Partners Pty Ltd', 'https://example.com/sample', '+61 3 5550 2000',
    array['Commercial litigation', 'Insolvency'], '10-50 lawyers', 'active'),
  ('Testbridge Legal', 'Testbridge Legal Pty Ltd', 'https://example.com/testbridge', '+61 7 5550 3000',
    array['Family law', 'Wills and estates'], '1-10 lawyers', 'active');

with f as (select id, name from firms)
insert into people (first_name, last_name, phone, location, source_type, source_detail, status)
select v.first_name, v.last_name, v.phone, v.location, v.source_type, v.source_detail, 'active'::record_status
from (values
  ('Alex', 'Testperson', '+61 4 0000 0001', 'Sydney NSW', 'manual', 'Seed data'),
  ('Jordan', 'Sampleford', '+61 4 0000 0002', 'Melbourne VIC', 'manual', 'Seed data'),
  ('Casey', 'Fictionalis', '+61 4 0000 0003', 'Brisbane QLD', 'manual', 'Seed data')
) as v(first_name, last_name, phone, location, source_type, source_detail);

insert into email_addresses (person_id, email, is_primary, verification_status)
select p.id, lower(p.first_name) || '.' || lower(p.last_name) || '@example-seed.test', true, 'unknown'
from people p;

insert into candidate_profiles (
  person_id, current_title, years_pqe, admission_jurisdictions, practice_areas,
  desired_locations, work_preferences, salary_current, salary_expected, candidate_status
)
select
  p.id,
  v.current_title,
  v.years_pqe,
  v.admission_jurisdictions,
  v.practice_areas,
  v.desired_locations,
  v.work_preferences,
  v.salary_current,
  v.salary_expected,
  v.candidate_status
from people p
join (values
  ('Testperson', 'Senior Associate', 6.0, array['NSW'], array['Commercial litigation'],
    array['Sydney'], array['Hybrid'], 185000.00, 210000.00, 'active'),
  ('Sampleford', 'Associate', 3.0, array['VIC'], array['Corporate and M&A'],
    array['Melbourne'], array['Office'], 145000.00, 165000.00, 'prospective'),
  ('Fictionalis', 'Special Counsel', 10.0, array['QLD'], array['Family law'],
    array['Brisbane', 'Gold Coast'], array['Remote'], 220000.00, 250000.00, 'prospective')
) as v(last_name, current_title, years_pqe, admission_jurisdictions, practice_areas,
       desired_locations, work_preferences, salary_current, salary_expected, candidate_status)
  on v.last_name = p.last_name;
