import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { MarketingTabs } from '@/components/MarketingTabs'
import { SegmentFilterFields } from '@/components/SegmentFilterFields'
import {
  createAdHocCampaign,
  fetchEmailTemplates,
  fetchSegmentCount,
  type EmailTemplate,
  type PermissionPurpose,
  type SegmentFilter,
} from '@/lib/campaigns'

export function ComposePage() {
  const navigate = useNavigate()

  const [filter, setFilter] = useState<SegmentFilter>({})
  const [count, setCount] = useState<number | null>(null)
  const [countLoading, setCountLoading] = useState(false)
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState<PermissionPurpose>('recruitment')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchEmailTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load templates.'))
  }, [])

  useEffect(() => {
    let cancelled = false
    setCountLoading(true)
    const timeout = setTimeout(() => {
      fetchSegmentCount(filter)
        .then((n) => {
          if (!cancelled) setCount(n)
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Could not compute the recipient count.')
        })
        .finally(() => {
          if (!cancelled) setCountLoading(false)
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [filter])

  async function handleCreate() {
    if (!templateId || !name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const campaignId = await createAdHocCampaign(name.trim(), purpose, templateId, filter)
      navigate(`/marketing/campaigns/${campaignId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this campaign.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">Marketing</h1>
        <MarketingTabs />

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">Compose</h2>
          <p className="mt-1 text-sm text-sec">
            Filter who this reaches, pick a template, and send — no need to name or save a list first.
          </p>
        </div>

        {error && <div className="rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-ink/10 bg-paper p-5">
            <h3 className="font-display text-sm font-semibold text-ink">Who should this reach?</h3>
            <SegmentFilterFields filter={filter} onChange={setFilter} />
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-ink/10 bg-paper p-5 text-center">
              <p className="text-3xl font-bold tabular-nums text-ox">
                {countLoading ? '…' : (count ?? '—')}
              </p>
              <p className="text-sm text-sec">
                {count === 1 ? 'person matches' : 'people match'} these filters right now
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-ink/10 bg-paper p-5">
              <div>
                <label htmlFor="compose-name" className="block text-sm font-medium text-sec">
                  Campaign name
                </label>
                <input
                  id="compose-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. September Banking & Finance update"
                  className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="compose-purpose" className="block text-sm font-medium text-sec">
                    Purpose
                  </label>
                  <select
                    id="compose-purpose"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value as PermissionPurpose)}
                    className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
                  >
                    <option value="recruitment">Recruitment</option>
                    <option value="blog">Blog</option>
                    <option value="report">Report</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="compose-template" className="block text-sm font-medium text-sec">
                    Template
                  </label>
                  <select
                    id="compose-template"
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
              </div>
              <p className="text-xs text-ink/40">
                This creates a draft campaign — an admin still needs to approve it before anything sends,
                and every message gets an unsubscribe link added automatically.
              </p>
              <button
                onClick={handleCreate}
                disabled={creating || !templateId || !name.trim() || (count ?? 0) === 0}
                className="w-full rounded-md border-2 border-ox bg-ox px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create campaign'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
