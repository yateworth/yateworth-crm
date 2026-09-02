import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Placement = Database['public']['Tables']['placements']['Row']
export type InvoiceStatus = Database['public']['Enums']['invoice_status']

export const INVOICE_STATUSES: InvoiceStatus[] = ['not_invoiced', 'invoiced', 'paid', 'written_off']

export interface PlacementWithDetails extends Placement {
  submissions: {
    jobs: { title: string; firms: { name: string } | null } | null
    candidate_profiles: { people: { first_name: string; last_name: string } | null } | null
  } | null
}

export interface PlaceableSubmission {
  id: string
  job_title: string
  firm_name: string | null
  candidate_name: string
}

const PLACEMENT_SELECT =
  '*, submissions(jobs(title, firms(name)), candidate_profiles(people(first_name, last_name)))'

export async function fetchPlacements(): Promise<PlacementWithDetails[]> {
  const { data, error } = await supabase
    .from('placements')
    .select(PLACEMENT_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as PlacementWithDetails[]
}

/** Submissions at the 'placed' stage that don't have a placement recorded yet. */
export async function fetchPlaceableSubmissions(): Promise<PlaceableSubmission[]> {
  const { data: submissions, error } = await supabase
    .from('submissions')
    .select('id, jobs(title, firms(name)), candidate_profiles(people(first_name, last_name))')
    .eq('stage', 'placed')
  if (error) throw error

  const { data: placements, error: placementsError } = await supabase.from('placements').select('submission_id')
  if (placementsError) throw placementsError
  const alreadyPlaced = new Set((placements ?? []).map((p) => p.submission_id))

  return (submissions ?? [])
    .filter((s) => !alreadyPlaced.has(s.id))
    .map((s) => {
      const row = s as unknown as {
        id: string
        jobs: { title: string; firms: { name: string } | null } | null
        candidate_profiles: { people: { first_name: string; last_name: string } | null } | null
      }
      const person = row.candidate_profiles?.people
      return {
        id: row.id,
        job_title: row.jobs?.title ?? 'Unknown role',
        firm_name: row.jobs?.firms?.name ?? null,
        candidate_name: person ? `${person.first_name} ${person.last_name}` : 'Unknown candidate',
      }
    })
}

export interface CreatePlacementInput {
  submissionId: string
  startDate: string
  salary: string
  feeAmount: string
  guaranteeEndDate: string
}

export async function createPlacement(input: CreatePlacementInput): Promise<void> {
  const { error } = await supabase.from('placements').insert({
    submission_id: input.submissionId,
    start_date: input.startDate || null,
    salary: input.salary ? Number(input.salary) : null,
    fee_amount: input.feeAmount ? Number(input.feeAmount) : null,
    guarantee_end_date: input.guaranteeEndDate || null,
  })
  if (error) throw error
}

export async function setInvoiceStatus(placementId: string, status: InvoiceStatus): Promise<void> {
  const { error } = await supabase.from('placements').update({ invoice_status: status }).eq('id', placementId)
  if (error) throw error
}
