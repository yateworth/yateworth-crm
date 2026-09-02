import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { CountCard } from '@/components/CountCard'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchDashboardSummary,
  fetchSurveyAggregateReport,
  NotAuthorisedError,
  type DashboardSummary,
  type SurveyAggregateReport,
} from '@/lib/reporting'
import { fetchMyDueTasks, setTaskStatus, type Task } from '@/lib/tasks'
import { fetchSurveys, type SurveyListItem } from '@/lib/surveys'
import { fetchInsightsDashboard, type InsightsDashboard } from '@/lib/insights'
import { fetchJobsPipeline, type JobsPipeline } from '@/lib/jobs'
import { ChatAssistant } from '@/components/ChatAssistant'

const SURVEY_SLUG = 'australian-legal-survey'

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return days === 0 ? 'today' : `${days}d ago`
}

function money(value: number | null): string {
  return value != null ? `$${value.toLocaleString()}` : '—'
}

export function DashboardPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [survey, setSurvey] = useState<SurveyAggregateReport | null>(null)
  const [surveyMeta, setSurveyMeta] = useState<SurveyListItem | null>(null)
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [insights, setInsights] = useState<InsightsDashboard | null>(null)
  const [pipeline, setPipeline] = useState<JobsPipeline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadTasks() {
    setMyTasks(await fetchMyDueTasks())
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [summaryResult, surveyResult, surveysResult, tasksResult, insightsResult, pipelineResult] =
          await Promise.all([
            fetchDashboardSummary(),
            fetchSurveyAggregateReport(SURVEY_SLUG),
            fetchSurveys().catch(() => []),
            fetchMyDueTasks(),
            fetchInsightsDashboard().catch(() => null),
            fetchJobsPipeline().catch(() => null),
          ])
        if (cancelled) return
        setSummary(summaryResult)
        setSurvey(surveyResult)
        setSurveyMeta(surveysResult.find((s) => s.slug === SURVEY_SLUG) ?? null)
        setMyTasks(tasksResult)
        setInsights(insightsResult)
        setPipeline(pipelineResult)
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

  async function completeTask(id: string) {
    await setTaskStatus(id, 'completed')
    await loadTasks()
  }

  return (
    <Layout>
      <div className="space-y-6">
        {loading && <p className="text-sm text-sec">Loading…</p>}

        {error && (
          <div className="rounded-lg border border-brass/40 bg-brass/10 p-4 text-sm text-ink">
            {error}
          </div>
        )}

        {canManage && <ChatAssistant />}

        {!loading && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">
              My tasks (due today or overdue)
            </h2>
            <div className="mt-3 rounded-lg border border-ink/10 bg-paper p-5">
              {myTasks.length === 0 ? (
                <p className="text-sm text-ink/40">Nothing due — you're on top of it.</p>
              ) : (
                <ul className="space-y-2">
                  {myTasks.map((task) => (
                    <li key={task.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        onChange={() => completeTask(task.id)}
                        className="h-4 w-4 accent-ox"
                      />
                      <span className="text-ink">{task.title}</span>
                      {task.due_at && (
                        <span className="ml-auto text-xs text-ink/40">
                          due {new Date(task.due_at).toLocaleDateString()}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {pipeline && (pipeline.open_jobs.length > 0 || pipeline.closed_jobs.length > 0) && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">Jobs pipeline</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Open jobs</p>
                <p className="mt-1 text-xl font-bold text-ink">{pipeline.totals.open_count}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Est. pipeline value</p>
                <p className="mt-1 text-xl font-bold text-ink">{money(pipeline.totals.open_estimated_value)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
                  Closed jobs won
                </p>
                <p className="mt-1 text-xl font-bold text-ink">
                  {pipeline.totals.won_count} / {pipeline.totals.closed_count}
                </p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Fees won</p>
                <p className="mt-1 text-xl font-bold text-ox">{money(pipeline.totals.won_fee_total)}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Open</p>
                {pipeline.open_jobs.length === 0 ? (
                  <p className="mt-2 text-sm text-ink/40">No open jobs.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {pipeline.open_jobs.map((j) => (
                      <li key={j.job_id} className="flex items-baseline justify-between gap-2">
                        <Link to={`/jobs/${j.job_id}`} className="text-ink hover:underline">
                          {j.title} <span className="text-xs text-ink/40">— {j.firm_name}</span>
                        </Link>
                        <span className="shrink-0 text-xs text-sec">
                          {j.opened_at ? new Date(j.opened_at).toLocaleDateString() : '—'} · {money(j.estimated_value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Closed</p>
                {pipeline.closed_jobs.length === 0 ? (
                  <p className="mt-2 text-sm text-ink/40">No closed jobs.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {pipeline.closed_jobs.map((j) => (
                      <li key={j.job_id} className="flex items-baseline justify-between gap-2">
                        <Link to={`/jobs/${j.job_id}`} className="text-ink hover:underline">
                          {j.title} <span className="text-xs text-ink/40">— {j.firm_name}</span>
                        </Link>
                        <span className="shrink-0 text-xs">
                          {j.closed_at ? new Date(j.closed_at).toLocaleDateString() : '—'} ·{' '}
                          {j.won ? (
                            <span className="text-ox">won {money(j.fee_amount)}</span>
                          ) : (
                            <span className="text-ink/40">not won</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}

        {insights &&
          (insights.stale_candidates.length > 0 ||
            insights.stale_jobs.length > 0 ||
            insights.dormant_firms.length > 0) && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">
                Needs attention
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-ink/10 bg-paper p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
                    Stale candidates
                  </p>
                  {insights.stale_candidates.length === 0 ? (
                    <p className="mt-2 text-sm text-ink/40">All caught up.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {insights.stale_candidates.map((c) => (
                        <li key={c.person_id} className="flex items-baseline justify-between gap-2">
                          <Link to={`/candidates/${c.person_id}`} className="text-ink hover:underline">
                            {c.name}
                          </Link>
                          <span className="shrink-0 text-xs text-ink/40">
                            {timeAgo(c.last_contacted_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-lg border border-ink/10 bg-paper p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
                    Jobs open, no submissions
                  </p>
                  {insights.stale_jobs.length === 0 ? (
                    <p className="mt-2 text-sm text-ink/40">All caught up.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {insights.stale_jobs.map((j) => (
                        <li key={j.job_id} className="flex items-baseline justify-between gap-2">
                          <Link to={`/jobs/${j.job_id}`} className="text-ink hover:underline">
                            {j.title}
                          </Link>
                          <span className="shrink-0 text-xs text-ink/40">{j.firm_name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-lg border border-ink/10 bg-paper p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
                    Firm relationships gone quiet
                  </p>
                  {insights.dormant_firms.length === 0 ? (
                    <p className="mt-2 text-sm text-ink/40">All caught up.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {insights.dormant_firms.map((f) => (
                        <li key={f.firm_id} className="flex items-baseline justify-between gap-2">
                          <Link to={`/firms/${f.firm_id}`} className="text-ink hover:underline">
                            {f.name}
                          </Link>
                          <span className="shrink-0 text-xs text-ink/40">
                            {timeAgo(f.last_activity_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">Surveys</h2>
            <Link
              to="/surveys"
              className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-ink/10 bg-paper p-5 hover:bg-ink/5"
            >
              <div>
                <p className="font-medium text-ink">Australian Legal Survey</p>
                <p className="mt-1 text-sm text-sec">
                  {survey.total_responses} response{survey.total_responses === 1 ? '' : 's'} total
                  {surveyMeta ? ` · ${surveyMeta.status}` : ''}
                </p>
              </div>
              <span className="text-sm text-sec">View report →</span>
            </Link>
          </section>
        )}
      </div>
    </Layout>
  )
}
