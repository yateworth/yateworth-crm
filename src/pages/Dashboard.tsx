import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/contexts/AuthContext'
import { fetchMyDueTasks, setTaskStatus, type Task } from '@/lib/tasks'
import { fetchInsightsDashboard, fetchRecentBlogSignups, type InsightsDashboard, type BlogSignup } from '@/lib/insights'
import { fetchJobsPipeline, type JobsPipeline } from '@/lib/jobs'
import { fetchRecentCandidates, primaryEmail, type Candidate } from '@/lib/candidates'
import { fetchRecentFirms, type Firm } from '@/lib/firms'
import { ChatAssistant } from '@/components/ChatAssistant'
import { StatusBadge } from '@/components/StatusBadge'

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return days === 0 ? 'today' : `${days}d ago`
}

function money(value: number | null): string {
  return value != null ? `$${value.toLocaleString()}` : '—'
}

const TASK_SUBJECT_ROUTE: Record<string, string> = {
  people: '/candidates',
  firms: '/firms',
}

export function DashboardPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [insights, setInsights] = useState<InsightsDashboard | null>(null)
  const [pipeline, setPipeline] = useState<JobsPipeline | null>(null)
  const [recentCandidates, setRecentCandidates] = useState<Candidate[]>([])
  const [recentFirms, setRecentFirms] = useState<Firm[]>([])
  const [recentSignups, setRecentSignups] = useState<BlogSignup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadTasks() {
    setMyTasks(await fetchMyDueTasks())
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [tasksResult, insightsResult, pipelineResult, candidatesResult, firmsResult, signupsResult] =
          await Promise.all([
            fetchMyDueTasks(),
            fetchInsightsDashboard().catch(() => null),
            fetchJobsPipeline().catch(() => null),
            fetchRecentCandidates().catch(() => []),
            fetchRecentFirms().catch(() => []),
            fetchRecentBlogSignups().catch(() => []),
          ])
        if (cancelled) return
        setMyTasks(tasksResult)
        setInsights(insightsResult)
        setPipeline(pipelineResult)
        setRecentCandidates(candidatesResult)
        setRecentFirms(firmsResult)
        setRecentSignups(signupsResult)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load dashboard data. Please try refreshing.')
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
                  {myTasks.map((task) => {
                    const route = task.subject_type ? TASK_SUBJECT_ROUTE[task.subject_type] : null
                    const label = (
                      <span className={route ? 'text-ink hover:underline' : 'text-ink'}>{task.title}</span>
                    )
                    return (
                      <li key={task.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          onChange={() => completeTask(task.id)}
                          className="h-4 w-4 accent-ox"
                        />
                        {route && task.subject_id ? (
                          <Link to={`${route}/${task.subject_id}`}>{label}</Link>
                        ) : (
                          label
                        )}
                        {task.due_at && (
                          <span className="ml-auto text-xs text-ink/40">
                            due {new Date(task.due_at).toLocaleDateString()}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {pipeline && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">Jobs pipeline</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-art/30 bg-art/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Open jobs</p>
                <p className="mt-1 text-2xl font-bold text-ink">{pipeline.totals.open_count}</p>
              </div>
              <div className="rounded-lg border border-brass/40 bg-brass/15 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Est. pipeline value</p>
                <p className="mt-1 text-2xl font-bold text-ink">{money(pipeline.totals.open_estimated_value)}</p>
              </div>
              <div className="rounded-lg border border-ink/15 bg-paper p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                  Closed jobs won
                </p>
                <p className="mt-1 text-2xl font-bold text-ink">
                  {pipeline.totals.won_count} / {pipeline.totals.closed_count}
                </p>
              </div>
              <div className="rounded-lg border border-success/40 bg-success/15 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Fees won</p>
                <p className="mt-1 text-2xl font-bold text-success">{money(pipeline.totals.won_fee_total)}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Open</p>
                {pipeline.open_jobs.length === 0 ? (
                  <p className="mt-2 text-sm text-ink/40">No open jobs.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {pipeline.open_jobs.map((j) => (
                      <li
                        key={j.job_id}
                        className="flex items-center justify-between gap-2 rounded-md border-l-4 border-art bg-art/5 px-3 py-2"
                      >
                        <Link to={`/jobs/${j.job_id}`} className="text-ink hover:underline">
                          {j.title} <span className="text-xs text-ink/40">— {j.firm_name}</span>
                        </Link>
                        <span className="shrink-0 text-right text-xs text-sec">
                          {j.opened_at ? new Date(j.opened_at).toLocaleDateString() : '—'}
                          <br />
                          <span className="font-semibold text-ink">{money(j.estimated_value)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-ink/10 bg-paper p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Closed</p>
                {pipeline.closed_jobs.length === 0 ? (
                  <p className="mt-2 text-sm text-ink/40">No closed jobs.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {pipeline.closed_jobs.map((j) => (
                      <li
                        key={j.job_id}
                        className={`flex items-center justify-between gap-2 rounded-md border-l-4 px-3 py-2 ${
                          j.won ? 'border-success bg-success/5' : 'border-ink/15 bg-ink/5'
                        }`}
                      >
                        <Link to={`/jobs/${j.job_id}`} className="text-ink hover:underline">
                          {j.title} <span className="text-xs text-ink/40">— {j.firm_name}</span>
                        </Link>
                        <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                          <span className="text-ink/40">
                            {j.closed_at ? new Date(j.closed_at).toLocaleDateString() : '—'}
                          </span>
                          {j.won ? (
                            j.fee_amount != null ? (
                              <StatusBadge label={`Won · ${money(j.fee_amount)}`} tone="success" />
                            ) : (
                              <Link to="/placements" className="hover:underline">
                                <StatusBadge label="Won · record fee →" tone="success" />
                              </Link>
                            )
                          ) : (
                            <StatusBadge label="Not won" tone="neutral" />
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

        {!loading &&
          (recentCandidates.length > 0 || recentFirms.length > 0 || recentSignups.length > 0) && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">Recently added</h2>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-ink/10 bg-paper p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">New candidates</p>
                  {recentCandidates.length === 0 ? (
                    <p className="mt-2 text-sm text-ink/40">None yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {recentCandidates.map((c) => (
                        <li key={c.id} className="flex items-baseline justify-between gap-2">
                          <Link to={`/candidates/${c.id}`} className="text-ink hover:underline">
                            {c.first_name} {c.last_name}
                          </Link>
                          <span className="shrink-0 text-xs text-ink/40">{primaryEmail(c)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-lg border border-ink/10 bg-paper p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">New firms</p>
                  {recentFirms.length === 0 ? (
                    <p className="mt-2 text-sm text-ink/40">None yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {recentFirms.map((f) => (
                        <li key={f.id} className="flex items-baseline justify-between gap-2">
                          <Link to={`/firms/${f.id}`} className="text-ink hover:underline">
                            {f.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-lg border border-ink/10 bg-paper p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
                    Newsletter sign-ups
                  </p>
                  {recentSignups.length === 0 ? (
                    <p className="mt-2 text-sm text-ink/40">None yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {recentSignups.map((s) =>
                        s.person_id ? (
                          <li key={s.email_address_id} className="flex items-baseline justify-between gap-2">
                            <Link to={`/candidates/${s.person_id}`} className="text-ink hover:underline">
                              {s.email}
                            </Link>
                            <span className="shrink-0 text-xs text-ink/40">{timeAgo(s.effective_at)}</span>
                          </li>
                        ) : (
                          <li key={s.email_address_id} className="flex items-baseline justify-between gap-2">
                            <span className="text-ink">{s.email}</span>
                            <span className="shrink-0 text-xs text-ink/40">{timeAgo(s.effective_at)}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          )}
      </div>
    </Layout>
  )
}
