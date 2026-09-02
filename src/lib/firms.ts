import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Firm = Database['public']['Tables']['firms']['Row']
export type RecordStatus = Database['public']['Enums']['record_status']
export type FirmRelationshipStage = Database['public']['Enums']['firm_relationship_stage']

export const FIRM_RELATIONSHIP_STAGES: FirmRelationshipStage[] = [
  'prospect',
  'contacted',
  'terms_sent',
  'terms_signed',
  'dormant',
]

export interface FirmContact {
  id: string
  role_title: string | null
  is_primary: boolean
  person_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
}

export interface FirmFormValues {
  name: string
  legalName: string
  website: string
  mainPhone: string
  address: string
  sizeBand: string
  practiceAreas: string
}

export const emptyFirmForm: FirmFormValues = {
  name: '',
  legalName: '',
  website: '',
  mainPhone: '',
  address: '',
  sizeBand: '',
  practiceAreas: '',
}

export function firmToFormValues(firm: Firm): FirmFormValues {
  const address = firm.address as { full?: string } | null
  return {
    name: firm.name,
    legalName: firm.legal_name ?? '',
    website: firm.website ?? '',
    mainPhone: firm.main_phone ?? '',
    address: address?.full ?? '',
    sizeBand: firm.size_band ?? '',
    practiceAreas: firm.practice_areas.join(', '),
  }
}

function splitList(value: string): string[] {
  return value
    ? value.split(',').map((s) => s.trim()).filter(Boolean)
    : []
}

function formValuesToRow(values: FirmFormValues) {
  return {
    name: values.name,
    legal_name: values.legalName || null,
    website: values.website || null,
    main_phone: values.mainPhone || null,
    address: values.address ? { full: values.address } : {},
    size_band: values.sizeBand || null,
    practice_areas: splitList(values.practiceAreas),
  }
}

export async function fetchFirms(status: RecordStatus): Promise<Firm[]> {
  const { data, error } = await supabase
    .from('firms')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchFirm(id: string): Promise<Firm> {
  const { data, error } = await supabase.from('firms').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createFirm(values: FirmFormValues): Promise<void> {
  const { error } = await supabase.from('firms').insert(formValuesToRow(values))
  if (error) throw error
}

export async function updateFirm(id: string, values: FirmFormValues): Promise<void> {
  const { error } = await supabase.from('firms').update(formValuesToRow(values)).eq('id', id)
  if (error) throw error
}

export async function setFirmStatus(id: string, status: RecordStatus): Promise<void> {
  const { error } = await supabase.from('firms').update({ status }).eq('id', id)
  if (error) throw error
}

export async function setFirmRelationshipStage(id: string, stage: FirmRelationshipStage): Promise<void> {
  const { error } = await supabase.from('firms').update({ relationship_stage: stage }).eq('id', id)
  if (error) throw error
}

export async function fetchFirmContacts(firmId: string): Promise<FirmContact[]> {
  const { data, error } = await supabase
    .from('firm_contacts')
    .select('id, role_title, is_primary, person_id, people(first_name, last_name, phone, email_addresses(email, is_primary))')
    .eq('firm_id', firmId)
    .order('is_primary', { ascending: false })
  if (error) throw error

  return (data ?? []).map((row) => {
    const person = row.people as unknown as {
      first_name: string
      last_name: string
      phone: string | null
      email_addresses: { email: string; is_primary: boolean }[]
    } | null
    const primaryEmail = person?.email_addresses?.find((e) => e.is_primary) ?? person?.email_addresses?.[0]
    return {
      id: row.id,
      role_title: row.role_title,
      is_primary: row.is_primary,
      person_id: row.person_id,
      first_name: person?.first_name ?? '',
      last_name: person?.last_name ?? '',
      phone: person?.phone ?? null,
      email: primaryEmail?.email ?? null,
    }
  })
}

export interface CreateFirmContactInput {
  firstName: string
  lastName: string
  email: string
  phone: string
  roleTitle: string
  isPrimary: boolean
}

export async function createFirmContact(firmId: string, input: CreateFirmContactInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_firm_contact', {
    p_firm_id: firmId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_email: input.email || undefined,
    p_phone: input.phone || undefined,
    p_role_title: input.roleTitle || undefined,
    p_is_primary: input.isPrimary,
  })
  if (error) throw error
  return data
}

export async function removeFirmContact(id: string): Promise<void> {
  const { error } = await supabase.from('firm_contacts').delete().eq('id', id)
  if (error) throw error
}
