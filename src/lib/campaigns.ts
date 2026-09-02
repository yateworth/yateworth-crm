import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/types/database'

export type PermissionPurpose = Database['public']['Enums']['permission_purpose']
export type CampaignStatus = Database['public']['Enums']['campaign_status']
export type RecipientStatus = Database['public']['Enums']['recipient_status']
export type MailingList = Database['public']['Tables']['mailing_lists']['Row']
export type EmailTemplate = Database['public']['Tables']['email_templates']['Row']
export type Campaign = Database['public']['Tables']['campaigns']['Row']

export interface CampaignWithNames extends Campaign {
  template_name: string
  list_name: string | null
}

export type ContactType = 'any' | 'candidate' | 'firm_contact' | 'subscriber'

/**
 * The compound filter select_segment_email_ids interprets (migration 23).
 * Every key is optional and AND-combined; contact_type narrows which of
 * the three branches (candidate / firm contact / bare-email subscriber)
 * are considered at all.
 */
export interface SegmentFilter {
  contact_type?: ContactType
  practice_areas?: string[]
  pqe_min?: number
  pqe_max?: number
  candidate_status?: string
  opted_in_purpose?: PermissionPurpose
}

export class NotAuthorisedError extends Error {}

function rethrow(error: { message: string }): never {
  if (error.message.includes('not authorised')) {
    throw new NotAuthorisedError('This action is only available to admin/marketing accounts.')
  }
  throw new Error(error.message)
}

// ---------------------------------------------------------------------
// Mailing lists
// ---------------------------------------------------------------------

export async function fetchMailingLists(): Promise<MailingList[]> {
  const { data, error } = await supabase.from('mailing_lists').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchMailingListMemberCount(listId: string): Promise<number> {
  const { count, error } = await supabase
    .from('mailing_list_members')
    .select('*', { count: 'exact', head: true })
    .eq('list_id', listId)
    .is('removed_at', null)
  if (error) throw error
  return count ?? 0
}

export async function createMailingList(
  name: string,
  purpose: PermissionPurpose,
  description: string | null,
  dynamicFilter: SegmentFilter | null,
): Promise<MailingList> {
  const { data, error } = await supabase
    .from('mailing_lists')
    .insert({ name, purpose, description, dynamic_filter: dynamicFilter as unknown as Json })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function syncMailingList(
  listId: string,
): Promise<{ added: number; removed: number; total_active: number }> {
  const { data, error } = await supabase.rpc('sync_mailing_list_members', { p_list_id: listId })
  if (error) rethrow(error)
  const row = data?.[0]
  return { added: row?.added ?? 0, removed: row?.removed ?? 0, total_active: row?.total_active ?? 0 }
}

/** Live "how many people match" count for a filter — no side effects, nothing saved. */
export async function fetchSegmentCount(filter: SegmentFilter): Promise<number> {
  const { data, error } = await supabase.rpc('compute_segment_count', { p_filter: filter as unknown as Json })
  if (error) rethrow(error)
  return data ?? 0
}

/**
 * The one-step path: filter, see a count, pick a template, send — no
 * separate "name and save a list" step. Creates a mailing list and
 * campaign behind the scenes (see migration 23) and returns the new
 * campaign's id so the caller can go straight to its detail page.
 */
export async function createAdHocCampaign(
  name: string,
  purpose: PermissionPurpose,
  templateId: string,
  filter: SegmentFilter,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_ad_hoc_campaign', {
    p_name: name,
    p_purpose: purpose,
    p_template_id: templateId,
    p_filter: filter as unknown as Json,
  })
  if (error) rethrow(error)
  return data as string
}

// ---------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------

export async function fetchEmailTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createEmailTemplate(
  name: string,
  purpose: PermissionPurpose,
  subjectTemplate: string,
  htmlTemplate: string,
  textTemplate: string,
): Promise<EmailTemplate> {
  const { data, error } = await supabase
    .from('email_templates')
    .insert({
      name,
      purpose,
      subject_template: subjectTemplate,
      html_template: htmlTemplate,
      text_template: textTemplate,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------

export async function fetchCampaigns(): Promise<CampaignWithNames[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, email_templates(name), mailing_lists(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => {
    const { email_templates, mailing_lists, ...campaign } = row as unknown as Campaign & {
      email_templates: { name: string } | null
      mailing_lists: { name: string } | null
    }
    return { ...campaign, template_name: email_templates?.name ?? '—', list_name: mailing_lists?.name ?? null }
  })
}

export async function fetchCampaign(id: string): Promise<CampaignWithNames | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, email_templates(name), mailing_lists(name)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { email_templates, mailing_lists, ...campaign } = data as unknown as Campaign & {
    email_templates: { name: string } | null
    mailing_lists: { name: string } | null
  }
  return { ...campaign, template_name: email_templates?.name ?? '—', list_name: mailing_lists?.name ?? null }
}

export async function createCampaign(
  name: string,
  purpose: PermissionPurpose,
  templateId: string,
  listId: string,
): Promise<Campaign> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const { data, error } = await supabase
    .from('campaigns')
    .insert({ name, purpose, template_id: templateId, list_id: listId, created_by: session?.user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export interface RecipientCounts {
  status: RecipientStatus
  count: number
}

export async function previewCampaignRecipients(campaignId: string): Promise<RecipientCounts[]> {
  const { data, error } = await supabase.rpc('generate_campaign_recipients', { p_campaign_id: campaignId })
  if (error) throw error
  return data ?? []
}

export async function approveCampaign(campaignId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_campaign', { p_campaign_id: campaignId })
  if (error) rethrow(error)
}

export async function setCampaignStatus(
  campaignId: string,
  status: Extract<CampaignStatus, 'paused' | 'scheduled' | 'cancelled' | 'completed'>,
): Promise<void> {
  const patch: Database['public']['Tables']['campaigns']['Update'] = { status }
  if (status === 'completed') patch.completed_at = new Date().toISOString()
  const { error } = await supabase.from('campaigns').update(patch).eq('id', campaignId)
  if (error) throw error
}

export interface SendBatchResult {
  claimed: number
  sent: number
  failed: number
}

export async function sendCampaignBatch(campaignId: string, batchSize = 50): Promise<SendBatchResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const response = await fetch('/api/send-campaign-batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ campaignId, batchSize }),
  })
  const body = (await response.json()) as SendBatchResult & { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Failed to send batch')
  return body
}
