import { supabase } from '@/lib/supabase'

/**
 * Hand-typed shapes for the two reporting RPCs — the generator can only
 * say "Returns: Json" for a jsonb-returning function, so these mirror
 * exactly what supabase/migrations/20260902000014_report_delivery_and_reporting.sql
 * builds. Keep in sync if that function's shape changes.
 */

export interface DashboardSummary {
  report_requests: Record<string, number>
  opt_ins: Record<string, number>
  active_suppressions_by_reason: Record<string, number>
  campaign_recipient_status: Record<string, number>
  email_message_status: Record<string, number>
}

export interface SurveyOptionAggregate {
  value: string
  count: number | null
  suppressed: boolean
}

export interface SurveyQuestionAggregate {
  key: string
  type: 'single_choice' | 'text'
  options: SurveyOptionAggregate[] | null
}

export interface SurveyAggregateReport {
  slug: string
  total_responses: number
  min_cohort: number
  questions: SurveyQuestionAggregate[]
}

/** Thrown when the signed-in user's role isn't admin/marketing. */
export class NotAuthorisedError extends Error {}

function rethrowAsNotAuthorised(error: { message: string }): never {
  if (error.message.includes('not authorised')) {
    throw new NotAuthorisedError('This report is only available to admin or marketing accounts.')
  }
  throw new Error(error.message)
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc('dashboard_summary')
  if (error) rethrowAsNotAuthorised(error)
  return data as unknown as DashboardSummary
}

export async function fetchSurveyAggregateReport(slug: string): Promise<SurveyAggregateReport> {
  const { data, error } = await supabase.rpc('survey_aggregate_report', { p_slug: slug })
  if (error) rethrowAsNotAuthorised(error)
  return data as unknown as SurveyAggregateReport
}
