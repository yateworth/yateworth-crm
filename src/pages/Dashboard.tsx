import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { CountCard } from '@/components/CountCard'
import {
  fetchDashboardSummary,
  fetchSurveyAggregateReport,
  NotAuthorisedError,
  type DashboardSummary,
  type SurveyAggregateReport,
} from '@/lib/reporting'
import { fetchMyDueTasks, setTaskStatus, type Task } from '@/lib/tasks'
import { fetchSurveys, type SurveyListItem } from '@/lib/surveys'

const SURVEY_SLUG = 'australian-legal-survey'

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [survey, setSurvey] = useState<SurveyAggregateReport | null>(null)
  const [surveyMeta, setSurveyMeta] = useState<SurveyListItem | null>(null)
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadTasks() {
    setMyTasks(await fetchMyDueTasks())
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [summaryResult, surveyResult, surveysResult, tasksResult] = await Promise.all([
          fetchDashboardSummary(),
          fetchSurveyAggregateReport(SURVEY_SLUG),
          fetchSurveys().catch(() => []),
          fetchMyDueTasks(),
        ])
        if (cancelled) return
        setSummary(summaryResult)
        setSurvey(surveyResult)
        setSurveyMeta(surveysResult.find((s) => s.slug === SURVEY_SLUG) ?? null)
        setMyTasks(tasksResult)
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
