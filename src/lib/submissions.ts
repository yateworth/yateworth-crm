import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Submission = Database['public']['Tables']['submissions']['Row']
export type SubmissionStage = Database['public']['Enums']['submission_stage']

export const SUBMISSION_STAGES: SubmissionStage[] = [
  'longlist',
  'shortlist',
  'submitted',
  'interview',
  'offer',
  'placed',
  'rejected',
  'withdrawn',
]

export interface SubmissionWithCandidate extends Submission {
  candidate_profiles: {
    current_title: string | null
    people: { first_name: string; last_name: string } | null
  } | null
}

export interface SubmissionWithJob extends Submission {
  jobs: { title: string; firms: { name: string } | null } | null
}

export async function fetchSubmissionsForJob(jobId: string): Promise<SubmissionWithCandidate[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*, candidate_profiles(current_title, people(first_name, last_name))')
    .eq('job_id', jobId)
  if (error) throw error
  return data as unknown as SubmissionWithCandidate[]
}

export async function fetchSubmissionsForCandidate(candidateId: string): Promise<SubmissionWithJob[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*, jobs(title, firms(name))')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as SubmissionWithJob[]
}

export async function submitCandidateToJob(jobId: string, candidateId: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { error } = await supabase.from('submissions').insert({
    job_id: jobId,
    candidate_id: candidateId,
    source: 'manual',
    created_by: session?.user.id,
  })
  if (error) throw error
}

export async function setSubmissionStage(id: string, stage: SubmissionStage): Promise<void> {
  const { error } = await supabase
    .from('submissions')
    .update({ stage, submitted_at: stage === 'submitted' ? new Date().toISOString() : undefined })
    .eq('id', id)
  if (error) throw error
}
