import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type ContractStatus = Database['public']['Enums']['contract_status']

export interface FirmContract {
  id: string
  status: ContractStatus
  fee_percent: number | null
  guarantee_days: number | null
  sent_at: string | null
  signed_at: string | null
  signed_by_name: string | null
  created_at: string
  sent_to_name: string | null
}

export async function fetchContractsForFirm(firmId: string): Promise<FirmContract[]> {
  const { data, error } = await supabase
    .from('firm_contracts')
    .select(
      'id, status, fee_percent, guarantee_days, sent_at, signed_at, signed_by_name, created_at, people:sent_to_person_id(first_name, last_name)',
    )
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => {
    const person = row.people as unknown as { first_name: string; last_name: string } | null
    return {
      id: row.id,
      status: row.status,
      fee_percent: row.fee_percent,
      guarantee_days: row.guarantee_days,
      sent_at: row.sent_at,
      signed_at: row.signed_at,
      signed_by_name: row.signed_by_name,
      created_at: row.created_at,
      sent_to_name: person ? `${person.first_name} ${person.last_name}` : null,
    }
  })
}

export interface SendContractInput {
  firmId: string
  contactPersonId: string
  feePercent?: number
  guaranteeDays?: number
}

/** Returns the signing link — worth showing to staff directly, since the fake email provider (no real one connected yet) never puts it in an actual inbox. */
export async function sendContract(input: SendContractInput): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const response = await fetch('/api/send-contract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      firmId: input.firmId,
      contactPersonId: input.contactPersonId,
      feePercent: input.feePercent,
      guaranteeDays: input.guaranteeDays,
    }),
  })
  const responseBody = (await response.json()) as { error?: string; signLink?: string }
  if (!response.ok) throw new Error(responseBody.error ?? 'Could not send this contract')
  return responseBody.signLink ?? ''
}

export async function voidContract(id: string): Promise<void> {
  const { error } = await supabase.rpc('void_contract', { p_contract_id: id })
  if (error) throw error
}
