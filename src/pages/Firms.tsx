import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { FirmForm } from '@/components/FirmForm'
import { useAuth } from '@/contexts/AuthContext'
import { fetchFirms, createFirm, emptyFirmForm, type Firm, type FirmFormValues, type RecordStatus } from '@/lib/firms'

export function FirmsPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'

  const [status, setStatus] = useState<RecordStatus>('active')
  const [firms, setFirms] = useState<Firm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [values, setValues] = useState<FirmFormValues>(emptyFirmForm)

  async function load() {
    setLoading(true)
    try {
      setFirms(await fetchFirms(status))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load firms.')
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
      await createFirm(values)
      setValues(emptyFirmForm)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this firm.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-neutral-900">Firms</h1>
          <div className="flex rounded-md border border-neutral-300 text-sm">
            {(['active', 'archived'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1 capitalize ${status === s ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            {showForm ? 'Cancel' : 'Add firm'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
          <FirmForm values={values} onChange={setValues} />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save firm'}
          </button>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : firms.length === 0 ? (
          <p className="text-sm text-neutral-400">No {status} firms.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-neutral-500">
                <tr>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Phone</th>
                  <th className="p-3 font-medium">Size</th>
                  <th className="p-3 font-medium">Practice areas</th>
                </tr>
              </thead>
              <tbody>
                {firms.map((firm) => (
                  <tr key={firm.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="p-3 font-medium text-neutral-900">
                      <Link to={`/firms/${firm.id}`} className="hover:underline">
                        {firm.name}
                      </Link>
                    </td>
                    <td className="p-3 text-neutral-600">{firm.main_phone ?? '—'}</td>
                    <td className="p-3 text-neutral-600">{firm.size_band ?? '—'}</td>
                    <td className="p-3 text-neutral-600">{firm.practice_areas.join(', ') || '—'}</td>
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
