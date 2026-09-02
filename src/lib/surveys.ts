import { supabase } from '@/lib/supabase'

export interface SurveyListItem {
  slug: string
  title: string
  status: 'draft' | 'open' | 'closed'
  opens_at: string | null
  closes_at: string | null
}

/** Thrown when the signed-in user's role isn't admin/marketing (list) or admin (status change). */
export class NotAuthorisedError extends Error {}

function rethrow(error: { message: string }): never {
  if (error.message.includes('not authorised')) {
    throw new NotAuthorisedError('This action is only available to admin accounts.')
  }
  throw new Error(error.message)
}

export async function fetchSurveys(): Promise<SurveyListItem[]> {
  const { data, error } = await supabase.rpc('list_surveys')
  if (error) rethrow(error)
  return (data ?? []) as SurveyListItem[]
}

export async function setSurveyStatus(
  slug: string,
  status: 'draft' | 'open' | 'closed',
): Promise<void> {
  const { error } = await supabase.rpc('set_survey_status', { p_slug: slug, p_status: status })
  if (error) rethrow(error)
}
