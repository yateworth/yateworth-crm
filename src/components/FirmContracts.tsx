import { useEffect, useState, type FormEvent } from 'react'
import { fetchContractsForFirm, sendContract, voidContract, type FirmContract } from '@/lib/contracts'
import { fetchFirmContacts, type FirmContact } from '@/lib/firms'
import { fetchDocumentLink } from '@/lib/documentLink'
import { StatusBadge, contractStatusTone } from '@/components/StatusBadge'

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  void: 'Void',
}

export function FirmContracts({ firmId }: { firmId: string }) {
  const [contracts, setContracts] = useState<FirmContract[]>([])
  const [contacts, setContacts] = useState<FirmContact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [contactPersonId, setContactPersonId] = useState('')
  const [feePercent, setFeePercent] = useState('')
  const [guaranteeDays, setGuaranteeDays] = useState('90')
  const [lastSignLink, setLastSignLink] = useState<string | null>(null)
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [contractsResult, contactsResult] = await Promise.all([
        fetchContractsForFirm(firmId),
        fetchFirmContacts(firmId),
      ])
      setContracts(contractsResult)
      setContacts(contactsResult)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load contracts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLastSignLink(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId])

  const contactsWithEmail = contacts.filter((c) => c.email)

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!contactPersonId) return
    setSending(true)
    setError(null)
    try {
      const signLink = await sendContract({
        firmId,
        contactPersonId,
        feePercent: feePercent ? Number(feePercent) : undefined,
        guaranteeDays: guaranteeDays ? Number(guaranteeDays) : undefined,
      })
      setLastSignLink(signLink || null)
      setContactPersonId('')
      setFeePercent('')
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this contract.')
    } finally {
      setSending(false)
    }
  }

  async function handlePreview(id: string) {
    setError(null)
    setPreviewingId(id)
    try {
      setLastSignLink(await fetchDocumentLink('contract', id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get this link.')
    } finally {
      setPreviewingId(null)
    }
  }

  async function handleVoid(id: string) {
    setError(null)
    try {
      await voidContract(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not void this contract.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink">Recruitment contract</h3>
        <button onClick={() => setShowForm((s) => !s)} className="text-sm text-ox hover:underline">
          {showForm ? 'Cancel' : 'Send contract'}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-ox">{error}</p>}

      {lastSignLink && (
        <div className="mt-2 rounded-md border border-brass/40 bg-brass/10 p-3 text-sm">
          <p className="text-ink">
            No real email provider is connected yet, so here's the exact link the contact would get:
          </p>
          <a href={lastSignLink} target="_blank" rel="noreferrer" className="break-all text-ox hover:underline">
            {lastSignLink}
          </a>
          <button
            onClick={() => setLastSignLink(null)}
            className="ml-2 align-baseline text-xs text-ink/40 hover:text-ox"
          >
            Dismiss
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSend} className="mt-3 space-y-2 rounded-md border border-ink/10 p-3">
          {contactsWithEmail.length === 0 ? (
            <p className="text-sm text-ink/40">
              Add a contact with an email address first — a contract needs somewhere to send.
            </p>
          ) : (
            <>
              <select
                required
                value={contactPersonId}
                onChange={(e) => setContactPersonId(e.target.value)}
                className="w-full rounded-md border border-ink/20 px-2 py-1 text-sm"
              >
                <option value="">Send to…</option>
                {contactsWithEmail.map((c) => (
                  <option key={c.person_id} value={c.person_id}>
                    {c.first_name} {c.last_name} ({c.email})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.1"
                  placeholder="Fee %"
                  value={feePercent}
                  onChange={(e) => setFeePercent(e.target.value)}
                  className="rounded-md border border-ink/20 px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  placeholder="Guarantee (days)"
                  value={guaranteeDays}
                  onChange={(e) => setGuaranteeDays(e.target.value)}
                  className="rounded-md border border-ink/20 px-2 py-1 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={sending}
                className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send for signature'}
              </button>
            </>
          )}
        </form>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : contracts.length === 0 ? (
          <p className="text-sm text-ink/40">No contract sent yet.</p>
        ) : (
          contracts.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={statusLabels[c.status]} tone={contractStatusTone[c.status] ?? 'neutral'} />
                  {c.fee_percent != null && <span className="text-xs text-ink/40">{c.fee_percent}% fee</span>}
                  {c.guarantee_days != null && (
                    <span className="text-xs text-ink/40">{c.guarantee_days}-day guarantee</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink/40">
                  {c.status === 'signed' && c.signed_by_name
                    ? `Signed by ${c.signed_by_name} on ${new Date(c.signed_at!).toLocaleDateString()}`
                    : c.sent_to_name
                      ? `Sent to ${c.sent_to_name}${c.sent_at ? ` on ${new Date(c.sent_at).toLocaleDateString()}` : ''}`
                      : 'Not yet sent'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePreview(c.id)}
                  disabled={previewingId === c.id}
                  className="text-xs text-ox hover:underline disabled:opacity-50"
                >
                  {previewingId === c.id ? 'Loading…' : 'Preview'}
                </button>
                {(c.status === 'draft' || c.status === 'sent') && (
                  <button onClick={() => handleVoid(c.id)} className="text-xs text-ink/40 hover:text-ox">
                    Void
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
