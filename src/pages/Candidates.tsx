import { useEffect, useState, type FormEvent } from 'react'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface CandidateRow {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  location: string | null
  candidate_profiles: {
    current_title: string | null
    practice_areas: string[]
    years_pqe: number | null
    candidate_status: string
  } | null
  email_addresses: { email: string; is_primary: boolean }[]
}

function primaryEmail(candidate: CandidateRow): string {
  const primary = candidate.email_addresses.find((e) => e.is_primary)
  return primary?.email ?? candidate.email_addresses[0]?.email ?? '—'
}

export function CandidatesPage() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'

  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [currentTitle, setCurrentTitle] = useState('')
  const [practiceAreas, setPracticeAreas] = useState('')
  const [yearsPqe, setYearsPqe] = useState('')

  async function loadCandidates() {
    setLoading(true)
    const { data, error } = await supabase
      .from('people')
      .select(
        'id, first_name, last_name, phone, location, candidate_profiles!inner(current_title, practice_areas, years_pqe, candidate_status), email_addresses(email, is_primary)',
      )
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setCandidates(data as unknown as CandidateRow[])
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadCandidates()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error } = await supabase.rpc('create_candidate', {
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: email,
      p_phone: phone || undefined,
      p_location: location || undefined,
      p_current_title: currentTitle || undefined,
      p_practice_areas: practiceAreas
        ? practiceAreas.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      p_years_pqe: yearsPqe ? Number(yearsPqe) : undefined,
    })

    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setLocation('')
    setCurrentTitle('')
    setPracticeAreas('')
    setYearsPqe('')
    setShowForm(false)
    loadCandidates()
  }

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Candidates</h1>
        {canManage && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            {showForm ? 'Cancel' : 'Add candidate'}
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
              <label htmlFor="c-first" className="block text-sm font-medium text-neutral-700">
                First name
              </label>
              <input
                id="c-first"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="c-last" className="block text-sm font-medium text-neutral-700">
                Last name
              </label>
              <input
                id="c-last"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="c-email" className="block text-sm font-medium text-neutral-700">
                Email
              </label>
              <input
                id="c-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="c-phone" className="block text-sm font-medium text-neutral-700">
                Phone
              </label>
              <input
                id="c-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="c-location" className="block text-sm font-medium text-neutral-700">
                Location
              </label>
              <input
                id="c-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="c-title" className="block text-sm font-medium text-neutral-700">
                Current title
              </label>
              <input
                id="c-title"
                value={currentTitle}
                onChange={(e) => setCurrentTitle(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="c-areas" className="block text-sm font-medium text-neutral-700">
                Practice areas (comma-separated)
              </label>
              <input
                id="c-areas"
                value={practiceAreas}
                onChange={(e) => setPracticeAreas(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="c-pqe" className="block text-sm font-medium text-neutral-700">
                Years PQE
              </label>
              <input
                id="c-pqe"
                type="number"
                min="0"
                step="0.5"
                value={yearsPqe}
                onChange={(e) => setYearsPqe(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save candidate'}
          </button>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-neutral-400">No candidates yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-neutral-500">
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
                  <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                    <td className="p-3 font-medium text-neutral-900">
                      {c.first_name} {c.last_name}
                    </td>
                    <td className="p-3 text-neutral-600">{primaryEmail(c)}</td>
                    <td className="p-3 text-neutral-600">{c.candidate_profiles?.current_title ?? '—'}</td>
                    <td className="p-3 text-neutral-600">{c.candidate_profiles?.years_pqe ?? '—'}</td>
                    <td className="p-3 text-neutral-600">
                      {c.candidate_profiles?.practice_areas.join(', ') || '—'}
                    </td>
                    <td className="p-3 text-neutral-600">{c.candidate_profiles?.candidate_status}</td>
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
