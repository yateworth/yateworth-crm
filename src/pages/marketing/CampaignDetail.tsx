import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/contexts/AuthContext'
import {
  approveCampaign,
  fetchCampaign,
  previewCampaignRecipients,
  sendCampaignBatch,
  setCampaignStatus,
  type CampaignWithNames,
  type RecipientCounts,
} from '@/lib/campaigns'

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [campaign, setCampaign] = useState<CampaignWithNames | null>(null)
  const [counts, setCounts] = useState<RecipientCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastBatchMessage, setLastBatchMessage] = useState<string | null>(null)

  async function load() {
    if (!id) return
    try {
      const [campaignResult, countsResult] = await Promise.all([
        fetchCampaign(id),
        previewCampaignRecipients(id),
      ])
      setCampaign(campaignResult)
      setCounts(countsResult)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this campaign.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSendBatch() {
    if (!id) return
    setBusy(true)
    setError(null)
    try {
      const result = await sendCampaignBatch(id)
      setLastBatchMessage(`Sent ${result.sent} of ${result.claimed} claimed (${result.failed} failed).`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this batch.')
    } finally {
      setBusy(false)
    }
  }

  const pending = counts.find((c) => c.status === 'pending')?.count ?? 0

  return (
    <Layout>
      <div className="space-y-6">
        <Link to="/marketing/campaigns" className="text-sm text-sec hover:text-ink">
          ← Campaigns
        </Link>

        {loading && <p className="text-sm text-sec">Loading…</p>}

        {error && <div className="rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>}

        {!loading && campaign && (
          <>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink">{campaign.name}</h1>
              <p className="mt-1 text-sm text-sec">
                {campaign.purpose} · template “{campaign.template_name}” · list “{campaign.list_name ?? '—'}”
              </p>
              <p className="mt-1 text-sm uppercase tracking-wide text-ink/40">{campaign.status}</p>
            </div>

            <div className="rounded-lg border border-ink/10 bg-paper p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">Recipients</h2>
              {counts.length === 0 ? (
                <p className="mt-2 text-sm text-ink/40">
                  No recipients generated yet — this list may be empty, or hasn't been synced.
                </p>
              ) : (
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {counts.map((c) => (
                    <div key={c.status} className="flex items-baseline justify-between text-sm">
                      <dt className="text-sec">{c.status}</dt>
                      <dd className="font-medium tabular-nums text-ink">{c.count}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            {lastBatchMessage && (
              <div className="rounded-lg border border-ink/10 bg-ink/5 p-3 text-sm text-ink">
                {lastBatchMessage}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {campaign.status === 'draft' && (
                <button
                  onClick={() => run(() => previewCampaignRecipients(campaign.id).then(setCounts))}
                  disabled={busy}
                  className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-sec hover:border-ox hover:text-ink disabled:opacity-50"
                >
                  Preview eligibility
                </button>
              )}

              {campaign.status === 'draft' && isAdmin && (
                <button
                  onClick={() => run(() => approveCampaign(campaign.id))}
                  disabled={busy}
                  className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white hover:bg-ox-lift disabled:opacity-50"
                >
                  Approve &amp; schedule
                </button>
              )}
              {campaign.status === 'draft' && !isAdmin && (
                <p className="text-sm text-ink/40">An admin needs to approve this campaign before it can send.</p>
              )}

              {(campaign.status === 'scheduled' || campaign.status === 'sending') && (
                <>
                  <button
                    onClick={handleSendBatch}
                    disabled={busy}
                    className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white hover:bg-ox-lift disabled:opacity-50"
                  >
                    Send next batch
                  </button>
                  <button
                    onClick={() => run(() => setCampaignStatus(campaign.id, 'paused'))}
                    disabled={busy}
                    className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-sec hover:border-ox hover:text-ink disabled:opacity-50"
                  >
                    Pause
                  </button>
                  {pending === 0 && (
                    <button
                      onClick={() => run(() => setCampaignStatus(campaign.id, 'completed'))}
                      disabled={busy}
                      className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-sec hover:border-ox hover:text-ink disabled:opacity-50"
                    >
                      Mark completed
                    </button>
                  )}
                </>
              )}

              {campaign.status === 'paused' && (
                <button
                  onClick={() => run(() => setCampaignStatus(campaign.id, 'scheduled'))}
                  disabled={busy}
                  className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white hover:bg-ox-lift disabled:opacity-50"
                >
                  Resume
                </button>
              )}

              {(campaign.status === 'draft' || campaign.status === 'scheduled' || campaign.status === 'paused') && (
                <button
                  onClick={() => run(() => setCampaignStatus(campaign.id, 'cancelled'))}
                  disabled={busy}
                  className="text-sm text-ink/40 hover:text-ox"
                >
                  Cancel campaign
                </button>
              )}
            </div>
          </>
        )}

        {!loading && !error && !campaign && <p className="text-sm text-ink/40">Campaign not found.</p>}
      </div>
    </Layout>
  )
}
