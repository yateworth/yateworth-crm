import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { CandidateForm } from '@/components/CandidateForm'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchCandidates,
  createCandidate,
  primaryEmail,
  emptyCandidateForm,
  type Candidate,
  type CandidateFormValues,
  type RecordStatus,
} from '@/lib/candidates'

export function CandidatesPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'

  const [status, setStatus] = useState<RecordStatus>('active')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [values, setValues] = useState<CandidateFormValues>(emptyCandidateForm)

  async function load() {
    setLoading(true)
    try {
      setCandidates(await fetchCandidates(status))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load candidates.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [status])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await createCandidate(values)
      setValues(emptyCandidateForm)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this candidate.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-lg font-semibold text-ink">Candidates</h1>
          <div className="flex rounded-md border border-ink/20 text-sm">
            {(['active', 'archived'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1 capitalize ${status === s ? 'bg-ox text-white' : 'text-sec'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift"
          >
            {showForm ? 'Cancel' : 'Add candidate'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-lg border border-ink/10 bg-paper p-5">
          <CandidateForm values={values} onChange={setValues} />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save candidate'}
          </button>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-ink/40">No {status} candidates.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 text-left text-sec">
                <tr>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Email</th>
                  <th className="p-3 font-medium">Title</th>
                  <th className="p-3 font-medium">PQE</th>
                  <th className="p-3 font-medium">Practice areas</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id} className="border-b border-ink/5 last:border-0 hover:bg-ground">
                    <td className="p-3 font-medium text-ink">
                      <Link to={`/candidates/${c.id}`} className="hover:underline">
                        {c.first_name} {c.last_name}
                      </Link>
                    </td>
                    <td className="p-3 text-sec">{primaryEmail(c)}</td>
                    <td className="p-3 text-sec">{c.candidate_profiles?.current_title ?? '—'}</td>
                    <td className="p-3 text-sec">{c.candidate_profiles?.years_pqe ?? '—'}</td>
                    <td className="p-3 text-sec">
                      {c.candidate_profiles?.practice_areas.join(', ') || '—'}
                    </td>
                    <td className="p-3 text-sec">{c.candidate_profiles?.candidate_status}</td>
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
