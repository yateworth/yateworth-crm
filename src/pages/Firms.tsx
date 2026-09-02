import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { FirmForm } from '@/components/FirmForm'
import { useAuth } from '@/contexts/AuthContext'
import { fetchFirms, createFirm, emptyFirmForm, type Firm, type FirmFormValues, type RecordStatus } from '@/lib/firms'
import { StatusBadge, relationshipStageTone } from '@/components/StatusBadge'

const stageLabels: Record<string, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  terms_sent: 'Terms sent',
  terms_signed: 'Terms signed',
  dormant: 'Dormant',
}

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
          <h1 className="font-display text-lg font-semibold text-ink">Firms</h1>
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
            className="rounded-lg bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift"
          >
            {showForm ? 'Cancel' : 'Add firm'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-lg border border-ink/10 bg-paper p-5">
          <FirmForm values={values} onChange={setValues} />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save firm'}
          </button>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : firms.length === 0 ? (
          <p className="text-sm text-ink/40">No {status} firms.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 text-left text-sec">
                <tr>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Relationship</th>
                  <th className="p-3 font-medium">Phone</th>
                  <th className="p-3 font-medium">Size</th>
                  <th className="p-3 font-medium">Practice areas</th>
                </tr>
              </thead>
              <tbody>
                {firms.map((firm) => (
                  <tr key={firm.id} className="border-b border-ink/5 last:border-0 hover:bg-ground">
                    <td className="p-3 font-medium text-ink">
                      <Link to={`/firms/${firm.id}`} className="hover:underline">
                        {firm.name}
                      </Link>
                    </td>
                    <td className="p-3">
                      <StatusBadge
                        label={stageLabels[firm.relationship_stage]}
                        tone={relationshipStageTone[firm.relationship_stage] ?? 'neutral'}
                      />
                    </td>
                    <td className="p-3 text-sec">{firm.main_phone ?? '—'}</td>
                    <td className="p-3 text-sec">{firm.size_band ?? '—'}</td>
                    <td className="p-3 text-sec">{firm.practice_areas.join(', ') || '—'}</td>
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
