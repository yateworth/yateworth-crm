import { useEffect, useState, type FormEvent } from 'react'
import { Layout } from '@/components/Layout'
import { MarketingTabs } from '@/components/MarketingTabs'
import {
  createMailingList,
  fetchMailingListMemberCount,
  fetchMailingLists,
  syncMailingList,
  type MailingList,
  type PermissionPurpose,
  type SegmentFilter,
} from '@/lib/campaigns'

const CANDIDATE_STATUSES = ['prospective', 'active', 'submitted', 'placed', 'inactive']
type SegmentKind = 'none' | SegmentFilter['kind']

interface ListRow extends MailingList {
  memberCount: number | null
}

export function MailingListsPage() {
  const [lists, setLists] = useState<ListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState<PermissionPurpose>('blog')
  const [description, setDescription] = useState('')
  const [segmentKind, setSegmentKind] = useState<SegmentKind>('none')
  const [candidateStatus, setCandidateStatus] = useState(CANDIDATE_STATUSES[1])
  const [practiceArea, setPracticeArea] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await fetchMailingLists()
      const counts = await Promise.all(data.map((l) => fetchMailingListMemberCount(l.id)))
      setLists(data.map((l, i) => ({ ...l, memberCount: counts[i] })))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load mailing lists.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function buildFilter(): SegmentFilter | null {
    if (segmentKind === 'none') return null
    if (segmentKind === 'opted_in') return { kind: 'opted_in', purpose }
    if (segmentKind === 'candidate_status') return { kind: 'candidate_status', status: candidateStatus }
    return { kind: 'practice_area', value: practiceArea.trim() }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const created = await createMailingList(name, purpose, description || null, buildFilter())
      if (buildFilter()) {
        await syncMailingList(created.id)
      }
      setName('')
      setDescription('')
      setSegmentKind('none')
      setPracticeArea('')
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this list.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSync(id: string) {
    setSyncingId(id)
    setError(null)
    try {
      await syncMailingList(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sync this list.')
    } finally {
      setSyncingId(null)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">Marketing</h1>
        <MarketingTabs />

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">Mailing lists</h2>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift"
          >
            {showForm ? 'Cancel' : 'New list'}
          </button>
        </div>

        {error && <div className="rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-ink/10 bg-paper p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="list-name" className="block text-sm font-medium text-sec">
                  Name
                </label>
                <input
                  id="list-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="list-purpose" className="block text-sm font-medium text-sec">
                  Purpose
                </label>
                <select
                  id="list-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value as PermissionPurpose)}
                  className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
                >
                  <option value="blog">Blog</option>
                  <option value="recruitment">Recruitment</option>
                  <option value="report">Report</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="list-description" className="block text-sm font-medium text-sec">
                Description
              </label>
              <input
                id="list-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="list-membership" className="block text-sm font-medium text-sec">
                Membership
              </label>
              <select
                id="list-membership"
                value={segmentKind}
                onChange={(e) => setSegmentKind(e.target.value as SegmentKind)}
                className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
              >
                <option value="none">Static — add members manually</option>
                <option value="opted_in">Everyone opted into {purpose}</option>
                <option value="candidate_status">Candidates with a given status</option>
                <option value="practice_area">Candidates in a practice area</option>
              </select>
              <p className="mt-1 text-xs text-ink/40">
                {segmentKind === 'none'
                  ? 'You add and remove members yourself; nothing here syncs automatically.'
                  : 'Membership refreshes each time you click "Sync now" below — it never sends anything by itself.'}
              </p>
            </div>

            {segmentKind === 'candidate_status' && (
              <div>
                <label htmlFor="list-candidate-status" className="block text-sm font-medium text-sec">
                  Candidate status
                </label>
                <select
                  id="list-candidate-status"
                  value={candidateStatus}
                  onChange={(e) => setCandidateStatus(e.target.value)}
                  className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
                >
                  {CANDIDATE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {segmentKind === 'practice_area' && (
              <div>
                <label htmlFor="list-practice-area" className="block text-sm font-medium text-sec">
                  Practice area
                </label>
                <input
                  id="list-practice-area"
                  required
                  value={practiceArea}
                  onChange={(e) => setPracticeArea(e.target.value)}
                  placeholder="e.g. Banking & Finance"
                  className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save list'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : lists.length === 0 ? (
          <p className="text-sm text-ink/40">No mailing lists yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 text-left text-sec">
                <tr>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Purpose</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Members</th>
                  <th className="p-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lists.map((list) => (
                  <tr key={list.id} className="border-b border-ink/5 last:border-0 hover:bg-ground">
                    <td className="p-3 font-medium text-ink">{list.name}</td>
                    <td className="p-3 text-sec">{list.purpose}</td>
                    <td className="p-3 text-sec">
                      {list.dynamic_filter
                        ? `Segment: ${(list.dynamic_filter as SegmentFilter).kind}`
                        : 'Static'}
                    </td>
                    <td className="p-3 tabular-nums text-ink">{list.memberCount ?? '—'}</td>
                    <td className="p-3 text-right">
                      {list.dynamic_filter && (
                        <button
                          onClick={() => handleSync(list.id)}
                          disabled={syncingId === list.id}
                          className="text-sm text-ox hover:underline disabled:opacity-50"
                        >
                          {syncingId === list.id ? 'Syncing…' : 'Sync now'}
                        </button>
                      )}
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
