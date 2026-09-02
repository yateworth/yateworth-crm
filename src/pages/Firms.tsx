import { useEffect, useState, type FormEvent } from 'react'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Firm = Database['public']['Tables']['firms']['Row']

export function FirmsPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'

  const [firms, setFirms] = useState<Firm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [mainPhone, setMainPhone] = useState('')
  const [practiceAreas, setPracticeAreas] = useState('')

  async function loadFirms() {
    setLoading(true)
    const { data, error } = await supabase
      .from('firms')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setFirms(data)
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadFirms()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error } = await supabase.from('firms').insert({
      name,
      website: website || null,
      main_phone: mainPhone || null,
      practice_areas: practiceAreas
        ? practiceAreas.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    })

    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setName('')
    setWebsite('')
    setMainPhone('')
    setPracticeAreas('')
    setShowForm(false)
    loadFirms()
  }

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Firms</h1>
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
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firm-name" className="block text-sm font-medium text-neutral-700">
                Name
              </label>
              <input
                id="firm-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="firm-phone" className="block text-sm font-medium text-neutral-700">
                Phone
              </label>
              <input
                id="firm-phone"
                value={mainPhone}
                onChange={(e) => setMainPhone(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="firm-website" className="block text-sm font-medium text-neutral-700">
                Website
              </label>
              <input
                id="firm-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="firm-areas" className="block text-sm font-medium text-neutral-700">
                Practice areas (comma-separated)
              </label>
              <input
                id="firm-areas"
                value={practiceAreas}
                onChange={(e) => setPracticeAreas(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
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
          <p className="text-sm text-neutral-400">No firms yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-neutral-500">
                <tr>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Phone</th>
                  <th className="p-3 font-medium">Practice areas</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {firms.map((firm) => (
                  <tr key={firm.id} className="border-b border-neutral-100 last:border-0">
                    <td className="p-3 font-medium text-neutral-900">
                      {firm.website ? (
                        <a href={firm.website} target="_blank" rel="noreferrer" className="hover:underline">
                          {firm.name}
                        </a>
                      ) : (
                        firm.name
                      )}
                    </td>
                    <td className="p-3 text-neutral-600">{firm.main_phone ?? '—'}</td>
                    <td className="p-3 text-neutral-600">{firm.practice_areas.join(', ') || '—'}</td>
                    <td className="p-3 text-neutral-600">{firm.status}</td>
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
