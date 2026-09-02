import { useEffect, useState, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { FirmForm } from '@/components/FirmForm'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchFirm,
  updateFirm,
  setFirmStatus,
  firmToFormValues,
  emptyFirmForm,
  type Firm,
  type FirmFormValues,
} from '@/lib/firms'

export function FirmDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'

  const [firm, setFirm] = useState<Firm | null>(null)
  const [values, setValues] = useState<FirmFormValues>(emptyFirmForm)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const data = await fetchFirm(id)
      setFirm(data)
      setValues(firmToFormValues(data))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this firm.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  async function handleSave() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await updateFirm(id, values)
      setEditing(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveToggle() {
    if (!id || !firm) return
    try {
      await setFirmStatus(id, firm.status === 'active' ? 'archived' : 'active')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status.')
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="text-sm text-sec">Loading…</p>
      </Layout>
    )
  }

  if (!firm) {
    return (
      <Layout>
        <p className="text-sm text-ox">{error ?? 'Firm not found.'}</p>
        <Link to="/firms" className="mt-3 inline-block text-sm text-sec hover:underline">
          Back to firms
        </Link>
      </Layout>
    )
  }

  return (
    <Layout>
      <Link to="/firms" className="text-sm text-sec hover:underline">
        ← Firms
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold text-ink">{firm.name}</h1>
        {canManage && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    setEditing(false)
                    setValues(firmToFormValues(firm))
                  }}
                  className="rounded-md border border-ink/20 px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleArchiveToggle}
                  className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-sec"
                >
                  {firm.status === 'active' ? 'Archive' : 'Restore'}
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift"
                >
                  Edit
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {firm.status === 'archived' && (
        <p className="mt-2 inline-block rounded-full bg-tint px-2.5 py-1 text-xs font-medium text-sec">
          Archived
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">
          {error}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-ink/10 bg-paper p-5">
        {editing ? (
          <FirmForm values={values} onChange={setValues} />
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Legal name" value={firm.legal_name} />
            <Field
              label="Website"
              value={
                firm.website ? (
                  <a href={firm.website} target="_blank" rel="noreferrer" className="hover:underline">
                    {firm.website}
                  </a>
                ) : null
              }
            />
            <Field label="Phone" value={firm.main_phone} />
            <Field label="Size" value={firm.size_band} />
            <Field label="Address" value={(firm.address as { full?: string } | null)?.full} />
            <Field label="Practice areas" value={firm.practice_areas.join(', ')} />
          </dl>
        )}
      </div>
    </Layout>
  )
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">{label}</dt>
      <dd className="mt-0.5 text-ink">{value || '—'}</dd>
    </div>
  )
}
