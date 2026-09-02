import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { MarketingTabs } from '@/components/MarketingTabs'
import {
  createCampaign,
  fetchCampaigns,
  fetchEmailTemplates,
  fetchMailingLists,
  type CampaignWithNames,
  type EmailTemplate,
  type MailingList,
  type PermissionPurpose,
} from '@/lib/campaigns'

const statusClass: Record<string, string> = {
  draft: 'bg-ink/10 text-ink/60',
  scheduled: 'bg-brass/20 text-brass',
  sending: 'bg-ox/20 text-ox',
  paused: 'bg-ink/10 text-ink/60',
  completed: 'bg-ink/10 text-ink/40',
  cancelled: 'bg-ink/10 text-ink/40',
}

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignWithNames[]>([])
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [lists, setLists] = useState<MailingList[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState<PermissionPurpose>('blog')
  const [templateId, setTemplateId] = useState('')
  const [listId, setListId] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [c, t, l] = await Promise.all([fetchCampaigns(), fetchEmailTemplates(), fetchMailingLists()])
      setCampaigns(c)
      setTemplates(t)
      setLists(l)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load campaigns.')
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
      await createCampaign(name, purpose, templateId, listId)
      setName('')
      setTemplateId('')
      setListId('')
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this campaign.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">Marketing</h1>
        <MarketingTabs />

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">Campaigns</h2>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift"
          >
            {showForm ? 'Cancel' : 'New campaign'}
          </button>
        </div>

        {error && <div className="rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-ink/10 bg-paper p-5">
            <div>
              <label htmlFor="campaign-name" className="block text-sm font-medium text-sec">
                Name
              </label>
              <input
                id="campaign-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="campaign-purpose" className="block text-sm font-medium text-sec">
                  Purpose
                </label>
                <select
                  id="campaign-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value as PermissionPurpose)}
                  className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
                >
                  <option value="blog">Blog</option>
                  <option value="recruitment">Recruitment</option>
                  <option value="report">Report</option>
                </select>
              </div>
              <div>
                <label htmlFor="campaign-template" className="block text-sm font-medium text-sec">
                  Template
                </label>
                <select
                  id="campaign-template"
                  required
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
                >
                  <option value="">Select a template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="campaign-list" className="block text-sm font-medium text-sec">
                  Mailing list
                </label>
                <select
                  id="campaign-list"
                  required
                  value={listId}
                  onChange={(e) => setListId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
                >
                  <option value="">Select a list</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save campaign'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-ink/40">No campaigns yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 text-left text-sec">
                <tr>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Template</th>
                  <th className="p-3 font-medium">List</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-ink/5 last:border-0 hover:bg-ground">
                    <td className="p-3 font-medium text-ink">
                      <Link to={`/marketing/campaigns/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="p-3 text-sec">{c.template_name}</td>
                    <td className="p-3 text-sec">{c.list_name ?? '—'}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${statusClass[c.status] ?? ''}`}
                      >
                        {c.status}
                      </span>
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
