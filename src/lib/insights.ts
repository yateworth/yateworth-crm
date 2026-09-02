import { supabase } from '@/lib/supabase'

export interface StaleCandidate {
  person_id: string
  name: string
  last_contacted_at: string | null
}

export interface StaleJob {
  job_id: string
  title: string
  firm_name: string
  opened_at: string
}

export interface DormantFirm {
  firm_id: string
  name: string
  relationship_stage: string
  last_activity_at: string | null
}

export interface InsightsDashboard {
  stale_candidates: StaleCandidate[]
  stale_jobs: StaleJob[]
  dormant_firms: DormantFirm[]
}

/** admin/recruiter only — resolves to null (not an error) for any other role, so the dashboard can just hide the section. */
export async function fetchInsightsDashboard(): Promise<InsightsDashboard | null> {
  const { data, error } = await supabase.rpc('insights_dashboard')
  if (error) {
    if (error.message.includes('not authorised')) return null
    throw error
  }
  return data as unknown as InsightsDashboard
}
