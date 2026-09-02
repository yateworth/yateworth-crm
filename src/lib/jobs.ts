import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Job = Database['public']['Tables']['jobs']['Row']
export type JobStatus = Database['public']['Enums']['job_status']

export interface JobWithFirm extends Job {
  firms: { name: string } | null
}

export interface JobFormValues {
  firmId: string
  title: string
  practiceArea: string
  location: string
  employmentType: string
  minPqe: string
  maxPqe: string
  salaryMin: string
  salaryMax: string
  feePercent: string
  description: string
}

export const emptyJobForm: JobFormValues = {
  firmId: '',
  title: '',
  practiceArea: '',
  location: '',
  employmentType: '',
  minPqe: '',
  maxPqe: '',
  salaryMin: '',
  salaryMax: '',
  feePercent: '',
  description: '',
}

export async function fetchJobs(): Promise<JobWithFirm[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, firms(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as JobWithFirm[]
}

export async function fetchJob(id: string): Promise<JobWithFirm> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, firms(name)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as unknown as JobWithFirm
}

export async function createJob(values: JobFormValues): Promise<void> {
  const { error } = await supabase.from('jobs').insert({
    firm_id: values.firmId,
    title: values.title,
    practice_area: values.practiceArea || null,
    location: values.location || null,
    employment_type: values.employmentType || null,
    min_pqe: values.minPqe ? Number(values.minPqe) : null,
    max_pqe: values.maxPqe ? Number(values.maxPqe) : null,
    salary_min: values.salaryMin ? Number(values.salaryMin) : null,
    salary_max: values.salaryMax ? Number(values.salaryMax) : null,
    fee_percent: values.feePercent ? Number(values.feePercent) : null,
    description: values.description || null,
    status: 'open',
    opened_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function setJobStatus(id: string, status: JobStatus): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({ status, closed_at: ['filled', 'closed', 'cancelled'].includes(status) ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}
