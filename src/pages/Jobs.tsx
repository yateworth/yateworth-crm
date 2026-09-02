import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJobs, createJob, emptyJobForm, type JobWithFirm, type JobFormValues } from '@/lib/jobs'
import { fetchFirms, type Firm } from '@/lib/firms'

export function JobsPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'

  const [jobs, setJobs] = useState<JobWithFirm[]>([])
  const [firms, setFirms] = useState<Firm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [values, setValues] = useState<JobFormValues>(emptyJobForm)

  async function load() {
    setLoading(true)
    try {
      const [jobsResult, firmsResult] = await Promise.all([fetchJobs(), fetchFirms('active')])
      setJobs(jobsResult)
      setFirms(firmsResult)
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

  function set<K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold text-ink">Jobs</h1>
        {canManage && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift"
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="job-firm" className="block text-sm font-medium text-sec">
                Firm
              </label>
              <select
                id="job-firm"
                required
                value={values.firmId}
                onChange={(e) => set('firmId', e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
              >
                <option value="">Select a firm</option>
                {firms.map((firm) => (
                  <option key={firm.id} value={firm.id}>
                    {firm.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="job-title" className="block text-sm font-medium text-sec">
                Title
              </label>
              <input
                id="job-title"
                required
                value={values.title}
                onChange={(e) => set('title', e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="job-area" className="block text-sm font-medium text-sec">
                Practice area
              </label>
              <input
                id="job-area"
                value={values.practiceArea}
                onChange={(e) => set('practiceArea', e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="job-location" className="block text-sm font-medium text-sec">
                Location
              </label>
              <input
                id="job-location"
                value={values.location}
                onChange={(e) => set('location', e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="job-min-pqe" className="block text-sm font-medium text-sec">
                Min PQE
              </label>
              <input
                id="job-min-pqe"
                type="number"
                value={values.minPqe}
                onChange={(e) => set('minPqe', e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="job-max-pqe" className="block text-sm font-medium text-sec">
                Max PQE
              </label>
              <input
                id="job-max-pqe"
                type="number"
                value={values.maxPqe}
                onChange={(e) => set('maxPqe', e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="job-salary-min" className="block text-sm font-medium text-sec">
                Salary min
              </label>
              <input
                id="job-salary-min"
                type="number"
                value={values.salaryMin}
                onChange={(e) => set('salaryMin', e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="job-salary-max" className="block text-sm font-medium text-sec">
                Salary max
              </label>
              <input
                id="job-salary-max"
                type="number"
                value={values.salaryMax}
                onChange={(e) => set('salaryMax', e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="job-fee" className="block text-sm font-medium text-sec">
                Fee %
              </label>
              <input
                id="job-fee"
                type="number"
                value={values.feePercent}
                onChange={(e) => set('feePercent', e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="job-description" className="block text-sm font-medium text-sec">
              Description
            </label>
            <textarea
              id="job-description"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
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
                    <td className="p-3 text-sec">{job.status}</td>
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
