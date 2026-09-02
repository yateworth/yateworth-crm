import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJobs, createJob, emptyJobForm, type JobWithFirm, type JobFormValues } from '@/lib/jobs'
import { StatusBadge, jobStatusTone } from '@/components/StatusBadge'
import { JobForm } from '@/components/JobForm'

export function JobsPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'

  const [jobs, setJobs] = useState<JobWithFirm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [values, setValues] = useState<JobFormValues>(emptyJobForm)

  async function load() {
    setLoading(true)
    try {
      setJobs(await fetchJobs())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load jobs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await createJob(values)
      setValues(emptyJobForm)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this job.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold text-ink">Jobs</h1>
        {canManage && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift"
          >
            {showForm ? 'Cancel' : 'Add job'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-lg border border-ink/10 bg-paper p-5">
          <JobForm values={values} onChange={setValues} />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save job'}
          </button>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-ink/40">No jobs yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 text-left text-sec">
                <tr>
                  <th className="p-3 font-medium">Title</th>
                  <th className="p-3 font-medium">Firm</th>
                  <th className="p-3 font-medium">Practice area</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-ink/5 last:border-0 hover:bg-ground">
                    <td className="p-3 font-medium text-ink">
                      <Link to={`/jobs/${job.id}`} className="hover:underline">
                        {job.title}
                      </Link>
                    </td>
                    <td className="p-3 text-sec">{job.firms?.name ?? '—'}</td>
                    <td className="p-3 text-sec">{job.practice_area ?? '—'}</td>
                    <td className="p-3">
                      <StatusBadge label={job.status.replace('_', ' ')} tone={jobStatusTone[job.status] ?? 'neutral'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
