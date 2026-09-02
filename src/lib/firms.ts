import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Firm = Database['public']['Tables']['firms']['Row']
export type RecordStatus = Database['public']['Enums']['record_status']

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
