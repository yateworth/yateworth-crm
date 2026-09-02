import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/contexts/AuthContext'
import { fetchSurveys, setSurveyStatus, NotAuthorisedError, type SurveyListItem } from '@/lib/surveys'
import { fetchSurveyAggregateReport, type SurveyAggregateReport } from '@/lib/reporting'

const STATUSES: SurveyListItem['status'][] = ['draft', 'open', 'closed']

export function SurveyDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { profile } = useAuth()
  const [survey, setSurvey] = useState<SurveyListItem | null>(null)
  const [report, setReport] = useState<SurveyAggregateReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  async function load() {
    if (!slug) return
    try {
      const [surveys, reportResult] = await Promise.all([
        fetchSurveys(),
        fetchSurveyAggregateReport(slug),
      ])
      setSurvey(surveys.find((s) => s.slug === slug) ?? null)
      setReport(reportResult)
    } catch (err) {
      setError(
        err instanceof NotAuthorisedError
          ? err.message
          : 'Could not load this survey. Please try refreshing.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  async function changeStatus(status: SurveyListItem['status']) {
    if (!slug || !survey || status === survey.status) return
    setUpdating(true)
    try {
      await setSurveyStatus(slug, status)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the survey status.')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <Link to="/surveys" className="text-sm text-sec hover:text-ink">
          ← Surveys
        </Link>

        {loading && <p className="text-sm text-sec">Loading…</p>}

        {error && (
          <div className="rounded-lg border border-brass/40 bg-brass/10 p-4 text-sm text-ink">
            {error}
          </div>
        )}

        {!loading && survey && report && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-ink">{survey.title}</h1>
                <p className="mt-1 text-sm text-ink/40">{survey.slug}</p>
              </div>

              {profile?.role === 'admin' ? (
                <div className="flex items-center gap-2">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      disabled={updating || status === survey.status}
                      onClick={() => changeStatus(status)}
                      className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide transition-colors disabled:cursor-default ${
                        status === survey.status
                          ? 'bg-ox text-ground'
                          : 'border border-ink/20 text-sec hover:border-ox hover:text-ink'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="rounded-full bg-ink/10 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-ink/60">
                  {survey.status}
                </span>
              )}
            </div>

            <p className="text-sm text-sec">
              {report.total_responses} response{report.total_responses === 1 ? '' : 's'} total.
              Any answer given by fewer than {report.min_cohort} respondents is withheld below.
            </p>

            <div className="space-y-4">
              {report.questions
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
          </>
        )}

        {!loading && !error && !survey && (
          <p className="text-sm text-ink/40">Survey not found.</p>
        )}
      </div>
    </Layout>
  )
}
