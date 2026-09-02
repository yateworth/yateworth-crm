import { useEffect, useState } from 'react'
import { Layout } from '@/components/Layout'
import { CountCard } from '@/components/CountCard'
import {
  fetchDashboardSummary,
  fetchSurveyAggregateReport,
  NotAuthorisedError,
  type DashboardSummary,
  type SurveyAggregateReport,
} from '@/lib/reporting'

const SURVEY_SLUG = 'australian-legal-survey'

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [survey, setSurvey] = useState<SurveyAggregateReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [summaryResult, surveyResult] = await Promise.all([
          fetchDashboardSummary(),
          fetchSurveyAggregateReport(SURVEY_SLUG),
        ])
        if (cancelled) return
        setSummary(summaryResult)
        setSurvey(surveyResult)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof NotAuthorisedError
            ? err.message
            : 'Could not load dashboard data. Please try refreshing.',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Layout>
      <div className="space-y-6">
        {loading && <p className="text-sm text-sec">Loading…</p>}

        {error && (
          <div className="rounded-lg border border-brass/40 bg-brass/10 p-4 text-sm text-ink">
            {error}
          </div>
        )}

        {summary && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">
              Overview
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CountCard title="Report requests" counts={summary.report_requests} />
              <CountCard title="Opt-ins by purpose" counts={summary.opt_ins} />
              <CountCard
                title="Active suppressions by reason"
                counts={summary.active_suppressions_by_reason}
                emptyLabel="No active suppressions"
              />
              <CountCard title="Campaign recipient status" counts={summary.campaign_recipient_status} />
              <CountCard title="Email message status" counts={summary.email_message_status} />
            </div>
          </section>
        )}

        {survey && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">
              Australian Legal Survey
            </h2>
            <p className="mt-2 text-sm text-sec">
              {survey.total_responses} response{survey.total_responses === 1 ? '' : 's'} total.
              Any answer given by fewer than {survey.min_cohort} respondents is withheld below.
            </p>
            <div className="mt-3 space-y-4">
              {survey.questions
                .filter((q) => q.options && q.options.length > 0)
                .map((question) => (
                  <div key={question.key} className="rounded-lg border border-ink/10 bg-paper p-5">
                    <h3 className="font-display text-sm font-semibold text-ink">{question.key}</h3>
                    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {question.options?.map((opt) => (
                        <div key={opt.value} className="flex items-baseline justify-between text-sm">
                          <dt className="text-sec">{opt.value}</dt>
                          <dd className="font-medium tabular-nums">
                            {opt.suppressed ? (
                              <span className="text-ink/40" title="Fewer than the minimum cohort">
                                suppressed
                              </span>
                            ) : (
                              <span className="text-ink">{opt.count}</span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  )
}
