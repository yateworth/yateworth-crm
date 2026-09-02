import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Person = Database['public']['Tables']['people']['Row']
type CandidateProfile = Database['public']['Tables']['candidate_profiles']['Row']
type EmailAddress = Database['public']['Tables']['email_addresses']['Row']
export type RecordStatus = Database['public']['Enums']['record_status']

export const CANDIDATE_STATUSES = ['prospective', 'active', 'submitted', 'placed', 'inactive'] as const

export interface Candidate extends Person {
  candidate_profiles: CandidateProfile | null
  email_addresses: EmailAddress[]
}

const CANDIDATE_SELECT =
  '*, candidate_profiles!inner(*), email_addresses(email, is_primary, id, verification_status, last_verified_at, created_at, person_id)'

export function primaryEmail(candidate: Candidate): string {
  const primary = candidate.email_addresses.find((e) => e.is_primary)
  return primary?.email ?? candidate.email_addresses[0]?.email ?? '—'
}

export async function fetchCandidates(status: RecordStatus): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from('people')
    .select(CANDIDATE_SELECT)
    .eq('status', status)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as Candidate[]
}

export async function fetchCandidate(id: string): Promise<Candidate> {
  const { data, error } = await supabase
    .from('people')
    .select(CANDIDATE_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as unknown as Candidate
}

export interface CandidateFormValues {
  firstName: string
  lastName: string
  preferredName: string
  email: string
  phone: string
  linkedinUrl: string
  location: string
  currentTitle: string
  currentFirmId: string
  yearsPqe: string
  admissionJurisdictions: string
  practiceAreas: string
  desiredLocations: string
  workPreferences: string
  salaryCurrent: string
  salaryExpected: string
  availabilityDate: string
  candidateStatus: string
  sourceType: string
  sourceDetail: string
}

export const emptyCandidateForm: CandidateFormValues = {
  firstName: '',
  lastName: '',
  preferredName: '',
  email: '',
  phone: '',
  linkedinUrl: '',
  location: '',
  currentTitle: '',
  currentFirmId: '',
  yearsPqe: '',
  admissionJurisdictions: '',
  practiceAreas: '',
  desiredLocations: '',
  workPreferences: '',
  salaryCurrent: '',
  salaryExpected: '',
  availabilityDate: '',
  candidateStatus: 'prospective',
  sourceType: '',
  sourceDetail: '',
}

export function candidateToFormValues(candidate: Candidate): CandidateFormValues {
  const profile = candidate.candidate_profiles
  return {
    firstName: candidate.first_name,
    lastName: candidate.last_name,
    preferredName: candidate.preferred_name ?? '',
    email: primaryEmail(candidate),
    phone: candidate.phone ?? '',
    linkedinUrl: candidate.linkedin_url ?? '',
    location: candidate.location ?? '',
    currentTitle: profile?.current_title ?? '',
    currentFirmId: profile?.current_firm_id ?? '',
    yearsPqe: profile?.years_pqe?.toString() ?? '',
    admissionJurisdictions: profile?.admission_jurisdictions.join(', ') ?? '',
    practiceAreas: profile?.practice_areas.join(', ') ?? '',
    desiredLocations: profile?.desired_locations.join(', ') ?? '',
    workPreferences: profile?.work_preferences.join(', ') ?? '',
    salaryCurrent: profile?.salary_current?.toString() ?? '',
    salaryExpected: profile?.salary_expected?.toString() ?? '',
    availabilityDate: profile?.availability_date ?? '',
    candidateStatus: profile?.candidate_status ?? 'prospective',
    sourceType: candidate.source_type ?? '',
    sourceDetail: candidate.source_detail ?? '',
  }
}

function splitList(value: string): string[] {
  return value
    ? value.split(',').map((s) => s.trim()).filter(Boolean)
    : []
}

export async function createCandidate(values: CandidateFormValues): Promise<string> {
  const { data, error } = await supabase.rpc('create_candidate', {
    p_first_name: values.firstName,
    p_last_name: values.lastName,
    p_email: values.email,
    p_phone: values.phone || undefined,
    p_location: values.location || undefined,
    p_current_title: values.currentTitle || undefined,
    p_practice_areas: values.practiceAreas ? splitList(values.practiceAreas) : undefined,
    p_years_pqe: values.yearsPqe ? Number(values.yearsPqe) : undefined,
  })
  if (error) throw error
  return data
}

/**
 * Two sequential updates (people, then candidate_profiles) rather than
 * one atomic call — both are covered by the same admin/recruiter RLS
 * policy from Milestone 1, and this is a plain edit of already-existing
 * rows rather than the multi-table *creation* create_candidate() has to
 * get right. Email is intentionally not editable here (see the plan).
 */
export async function updateCandidate(personId: string, values: CandidateFormValues): Promise<void> {
  const { error: personError } = await supabase
    .from('people')
    .update({
      first_name: values.firstName,
      last_name: values.lastName,
      preferred_name: values.preferredName || null,
      phone: values.phone || null,
      linkedin_url: values.linkedinUrl || null,
      location: values.location || null,
      source_type: values.sourceType || null,
      source_detail: values.sourceDetail || null,
    })
    .eq('id', personId)
  if (personError) throw personError

  const { error: profileError } = await supabase
    .from('candidate_profiles')
    .update({
      current_title: values.currentTitle || null,
      current_firm_id: values.currentFirmId || null,
      years_pqe: values.yearsPqe ? Number(values.yearsPqe) : null,
      admission_jurisdictions: splitList(values.admissionJurisdictions),
      practice_areas: splitList(values.practiceAreas),
      desired_locations: splitList(values.desiredLocations),
      work_preferences: splitList(values.workPreferences),
      salary_current: values.salaryCurrent ? Number(values.salaryCurrent) : null,
      salary_expected: values.salaryExpected ? Number(values.salaryExpected) : null,
      availability_date: values.availabilityDate || null,
      candidate_status: values.candidateStatus,
    })
    .eq('person_id', personId)
  if (profileError) throw profileError
}

export async function setCandidateStatus(personId: string, status: RecordStatus): Promise<void> {
  const { error } = await supabase.from('people').update({ status }).eq('id', personId)
  if (error) throw error
}

export async function setCandidateStage(
  personId: string,
  candidateStatus: (typeof CANDIDATE_STATUSES)[number],
): Promise<void> {
  const { error } = await supabase
    .from('candidate_profiles')
    .update({ candidate_status: candidateStatus })
    .eq('person_id', personId)
  if (error) throw error
}

export async function setPrivacyNoticeGiven(personId: string, given: boolean): Promise<void> {
  const { error } = await supabase
    .from('candidate_profiles')
    .update({ privacy_notice_at: given ? new Date().toISOString() : null })
    .eq('person_id', personId)
  if (error) throw error
}

export async function logContactNow(personId: string): Promise<void> {
  const { error } = await supabase
    .from('candidate_profiles')
    .update({ last_contacted_at: new Date().toISOString() })
    .eq('person_id', personId)
  if (error) throw error
}
