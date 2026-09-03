import { supabase } from '@/lib/supabase'

export interface JobInvoice {
  id: string
  placement_id: string
  invoice_number: string
  total_amount: number
  issued_at: string
  sent_at: string | null
  viewed_at: string | null
}

/** All invoices for a job's placements — mirrors fetchPlacementsForJob so JobDetail can show/send invoices right on the job. */
export async function fetchInvoicesForJob(jobId: string): Promise<JobInvoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, placement_id, invoice_number, total_amount, issued_at, sent_at, viewed_at, placements!inner(submissions!inner(job_id))')
    .eq('placements.submissions.job_id', jobId)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    placement_id: row.placement_id,
    invoice_number: row.invoice_number,
    total_amount: row.total_amount,
    issued_at: row.issued_at,
    sent_at: row.sent_at,
    viewed_at: row.viewed_at,
  }))
}

export interface SendInvoiceInput {
  placementId: string
  contactPersonId: string
  dueDays?: number
}

/** Returns the view link — worth showing to staff directly, since the fake email provider (no real one connected yet) never puts it in an actual inbox. */
export async function sendInvoice(input: SendInvoiceInput): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const response = await fetch('/api/send-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      placementId: input.placementId,
      contactPersonId: input.contactPersonId,
      dueDays: input.dueDays,
    }),
  })
  const responseBody = (await response.json()) as { error?: string; viewLink?: string }
  if (!response.ok) throw new Error(responseBody.error ?? 'Could not send this invoice')
  return responseBody.viewLink ?? ''
}
