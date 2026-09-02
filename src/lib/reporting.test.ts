import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}))

import { supabase } from '@/lib/supabase'
import { fetchDashboardSummary, fetchSurveyAggregateReport, NotAuthorisedError } from './reporting'

describe('reporting', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset()
  })

  it('fetchDashboardSummary returns the parsed summary on success', async () => {
    const summary = { report_requests: { delivered: 3 }, opt_ins: {}, active_suppressions_by_reason: {}, campaign_recipient_status: {}, email_message_status: {} }
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: summary, error: null } as never)

    await expect(fetchDashboardSummary()).resolves.toEqual(summary)
    expect(supabase.rpc).toHaveBeenCalledWith('dashboard_summary')
  })

  it('fetchDashboardSummary throws NotAuthorisedError when the RPC reports "not authorised"', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'not authorised' },
    } as never)

    await expect(fetchDashboardSummary()).rejects.toBeInstanceOf(NotAuthorisedError)
  })

  it('fetchDashboardSummary throws a plain Error for any other failure', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'connection reset' },
    } as never)

    await expect(fetchDashboardSummary()).rejects.toThrow('connection reset')
    await expect(fetchDashboardSummary()).rejects.not.toBeInstanceOf(NotAuthorisedError)
  })

  it('fetchSurveyAggregateReport passes the slug through as p_slug', async () => {
    const report = { slug: 'x', total_responses: 0, min_cohort: 5, questions: [] }
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: report, error: null } as never)

    await fetchSurveyAggregateReport('australian-legal-survey')
    expect(supabase.rpc).toHaveBeenCalledWith('survey_aggregate_report', {
      p_slug: 'australian-legal-survey',
    })
  })
})
