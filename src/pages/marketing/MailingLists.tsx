import { useEffect, useState, type FormEvent } from 'react'
import { Layout } from '@/components/Layout'
import { MarketingTabs } from '@/components/MarketingTabs'
import { SegmentFilterFields, describeFilter } from '@/components/SegmentFilterFields'
import {
  createMailingList,
  fetchMailingListMemberCount,
  fetchMailingLists,
  syncMailingList,
  type MailingList,
  type PermissionPurpose,
  type SegmentFilter,
} from '@/lib/campaigns'

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
  const [isStatic, setIsStatic] = useState(true)
  const [filter, setFilter] = useState<SegmentFilter>({})

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const dynamicFilter = isStatic ? null : filter
      const created = await createMailingList(name, purpose, description || null, dynamicFilter)
      if (dynamicFilter) {
        await syncMailingList(created.id)
      }
      setName('')
      setDescription('')
      setIsStatic(true)
      setFilter({})
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
              <span className="block text-sm font-medium text-sec">Membership</span>
              <div className="mt-1 flex rounded-md border border-ink/20 text-sm">
                <button
                  type="button"
                  onClick={() => setIsStatic(true)}
                  className={`flex-1 px-3 py-1.5 ${isStatic ? 'bg-ox text-white' : 'text-sec'}`}
                >
                  Static — add members manually
                </button>
                <button
                  type="button"
                  onClick={() => setIsStatic(false)}
                  className={`flex-1 px-3 py-1.5 ${!isStatic ? 'bg-ox text-white' : 'text-sec'}`}
                >
                  Smart — filter, and re-sync on demand
                </button>
              </div>
              <p className="mt-1 text-xs text-ink/40">
                {isStatic
                  ? 'You add and remove members yourself; nothing here syncs automatically.'
                  : 'Membership refreshes each time you click "Sync now" below — for a one-off send, Compose is faster.'}
              </p>
            </div>

            {!isStatic && <SegmentFilterFields filter={filter} onChange={setFilter} />}

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
                    <td className="p-3 text-sec">{describeFilter(list.dynamic_filter as SegmentFilter | null)}</td>
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
