import { useEffect, useState, type FormEvent } from 'react'
import { Layout } from '@/components/Layout'
import {
  fetchPlacements,
  fetchPlaceableSubmissions,
  createPlacement,
  setInvoiceStatus,
  INVOICE_STATUSES,
  type PlacementWithDetails,
  type PlaceableSubmission,
  type InvoiceStatus,
} from '@/lib/placements'
import { TONE_CLASSES, invoiceStatusTone } from '@/components/StatusBadge'

const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  not_invoiced: 'Not invoiced',
  invoiced: 'Invoiced',
  paid: 'Paid',
  written_off: 'Written off',
}

function money(value: number | null): string {
  return value != null ? `$${value.toLocaleString()}` : '—'
}

export function PlacementsPage() {
  const [placements, setPlacements] = useState<PlacementWithDetails[]>([])
  const [placeable, setPlaceable] = useState<PlaceableSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [submissionId, setSubmissionId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [salary, setSalary] = useState('')
  const [feeAmount, setFeeAmount] = useState('')
  const [guaranteeEndDate, setGuaranteeEndDate] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [placementsResult, placeableResult] = await Promise.all([
        fetchPlacements(),
        fetchPlaceableSubmissions(),
      ])
      setPlacements(placementsResult)
      setPlaceable(placeableResult)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load placements.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!submissionId) return
    setSubmitting(true)
    setError(null)
    try {
      await createPlacement({ submissionId, startDate, salary, feeAmount, guaranteeEndDate })
      setSubmissionId('')
      setStartDate('')
      setSalary('')
      setFeeAmount('')
      setGuaranteeEndDate('')
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record this placement.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusChange(placementId: string, status: InvoiceStatus) {
    try {
      await setInvoiceStatus(placementId, status)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update invoice status.')
    }
  }

  const totalFees = placements.reduce((sum, p) => sum + (p.fee_amount ?? 0), 0)
  const outstandingFees = placements
    .filter((p) => p.invoice_status !== 'paid' && p.invoice_status !== 'written_off')
    .reduce((sum, p) => sum + (p.fee_amount ?? 0), 0)

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold text-ink">Placements</h1>
        {placeable.length > 0 && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift"
          >
            {showForm ? 'Cancel' : 'Record placement'}
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-art/30 bg-art/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Total placements</p>
          <p className="mt-1 text-2xl font-bold text-ink">{placements.length}</p>
        </div>
        <div className="rounded-lg border border-success/40 bg-success/15 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Total fees</p>
          <p className="mt-1 text-2xl font-bold text-success">{money(totalFees)}</p>
        </div>
        <div className="rounded-lg border border-ox/30 bg-ox/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Outstanding</p>
          <p className="mt-1 text-2xl font-bold text-ox">{money(outstandingFees)}</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-lg border border-ink/10 bg-paper p-5">
          <div>
            <label htmlFor="placement-submission" className="block text-sm font-medium text-sec">
              Placed candidate
            </label>
            <select
              id="placement-submission"
              required
              value={submissionId}
              onChange={(e) => setSubmissionId(e.target.value)}
              className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
            >
              <option value="">Select a placed candidate…</option>
              {placeable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.candidate_name} — {s.job_title} ({s.firm_name ?? 'unknown firm'})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="placement-start-date" className="block text-sm font-medium text-sec">
                Start date
              </label>
              <input
                id="placement-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="placement-guarantee" className="block text-sm font-medium text-sec">
                Guarantee ends
              </label>
              <input
                id="placement-guarantee"
                type="date"
                value={guaranteeEndDate}
                onChange={(e) => setGuaranteeEndDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="placement-salary" className="block text-sm font-medium text-sec">
                Salary
              </label>
              <input
                id="placement-salary"
                type="number"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="placement-fee" className="block text-sm font-medium text-sec">
                Fee amount
              </label>
              <input
                id="placement-fee"
                type="number"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save placement'}
          </button>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : placements.length === 0 ? (
          <p className="text-sm text-ink/40">No placements recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 text-left text-sec">
                <tr>
                  <th className="p-3 font-medium">Candidate</th>
                  <th className="p-3 font-medium">Role</th>
                  <th className="p-3 font-medium">Start date</th>
                  <th className="p-3 font-medium">Salary</th>
                  <th className="p-3 font-medium">Fee</th>
                  <th className="p-3 font-medium">Guarantee ends</th>
                  <th className="p-3 font-medium">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {placements.map((p) => {
                  const person = p.submissions?.candidate_profiles?.people
                  return (
                    <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-ground">
                      <td className="p-3 font-medium text-ink">
                        {person ? `${person.first_name} ${person.last_name}` : '—'}
                      </td>
                      <td className="p-3 text-sec">
                        {p.submissions?.jobs?.title} — {p.submissions?.jobs?.firms?.name}
                      </td>
                      <td className="p-3 text-sec">{p.start_date ?? '—'}</td>
                      <td className="p-3 text-sec">{money(p.salary)}</td>
                      <td className="p-3 font-medium text-ink">{money(p.fee_amount)}</td>
                      <td className="p-3 text-sec">{p.guarantee_end_date ?? '—'}</td>
                      <td className="p-3">
                        <select
                          value={p.invoice_status}
                          onChange={(e) => handleStatusChange(p.id, e.target.value as InvoiceStatus)}
                          className={`rounded-full border-0 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${TONE_CLASSES[invoiceStatusTone[p.invoice_status]]}`}
                        >
                          {INVOICE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {invoiceStatusLabels[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
