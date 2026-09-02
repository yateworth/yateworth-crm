import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { fetchSurveys, NotAuthorisedError, type SurveyListItem } from '@/lib/surveys'

const statusClass: Record<SurveyListItem['status'], string> = {
  draft: 'bg-ink/10 text-ink/60',
  open: 'bg-brass/20 text-brass',
  closed: 'bg-ink/10 text-ink/40',
}

export function SurveysPage() {
  const [surveys, setSurveys] = useState<SurveyListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchSurveys()
      .then((data) => {
        if (!cancelled) setSurveys(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof NotAuthorisedError
            ? err.message
            : 'Could not load surveys. Please try refreshing.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">Surveys</h1>

        {loading && <p className="text-sm text-sec">Loading…</p>}

        {error && (
          <div className="rounded-lg border border-brass/40 bg-brass/10 p-4 text-sm text-ink">
            {error}
          </div>
        )}

        {!loading && !error && surveys.length === 0 && (
          <p className="text-sm text-ink/40">No surveys yet.</p>
        )}

        {!loading && surveys.length > 0 && (
          <div className="divide-y divide-ink/10 rounded-lg border border-ink/10 bg-paper">
            {surveys.map((survey) => (
              <Link
                key={survey.slug}
                to={`/surveys/${survey.slug}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-ink/5"
              >
                <div>
                  <p className="font-medium text-ink">{survey.title}</p>
                  <p className="mt-0.5 text-xs text-ink/40">{survey.slug}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${statusClass[survey.status]}`}
                >
                  {survey.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
