import { useEffect, useState, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { FileAttachments } from '@/components/FileAttachments'
import { JobForm } from '@/components/JobForm'
import { StatusBadge, jobStatusTone, submissionStageTone } from '@/components/StatusBadge'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchJob,
  setJobStatus,
  updateJob,
  jobToFormValues,
  emptyJobForm,
  type JobWithFirm,
  type JobStatus,
  type JobFormValues,
} from '@/lib/jobs'
import {
  fetchSubmissionsForJob,
  submitCandidateToJob,
  setSubmissionStage,
  SUBMISSION_STAGES,
  type SubmissionWithCandidate,
  type SubmissionStage,
} from '@/lib/submissions'
import { fetchCandidates, type Candidate } from '@/lib/candidates'
import {
  fetchPlacementsForJob,
  createPlacement,
  setInvoiceStatus,
  INVOICE_STATUSES,
  type JobPlacement,
} from '@/lib/placements'
import { fetchInvoicesForJob, sendInvoice, type JobInvoice } from '@/lib/invoices'
import { fetchFirmContacts, type FirmContact } from '@/lib/firms'
import { TONE_CLASSES, invoiceStatusTone } from '@/components/StatusBadge'

const JOB_STATUSES: JobStatus[] = ['draft', 'open', 'on_hold', 'filled', 'closed', 'cancelled']

const invoiceStatusLabels: Record<string, string> = {
  not_invoiced: 'Not invoiced',
  invoiced: 'Invoiced',
  paid: 'Paid',
  written_off: 'Written off',
}

function money(value: number | null): string {
  return value != null ? `$${value.toLocaleString()}` : '—'
}

function candidateName(s: SubmissionWithCandidate): string {
  const person = s.candidate_profiles?.people
  return person ? `${person.first_name} ${person.last_name}` : 'Unknown candidate'
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'

  const [job, setJob] = useState<JobWithFirm | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionWithCandidate[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [placements, setPlacements] = useState<JobPlacement[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [values, setValues] = useState<JobFormValues>(emptyJobForm)
  const [recordingFeeFor, setRecordingFeeFor] = useState<string | null>(null)
  const [feeForm, setFeeForm] = useState({ startDate: '', salary: '', feeAmount: '', guaranteeEndDate: '' })
  const [savingFee, setSavingFee] = useState(false)
  const [invoices, setInvoices] = useState<JobInvoice[]>([])
  const [firmContacts, setFirmContacts] = useState<FirmContact[]>([])
  const [sendingInvoiceFor, setSendingInvoiceFor] = useState<string | null>(null)
  const [invoiceForm, setInvoiceForm] = useState({ contactPersonId: '', dueDays: '14' })
  const [sendingInvoice, setSendingInvoice] = useState(false)
  const [lastInvoiceLink, setLastInvoiceLink] = useState<string | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const [jobResult, submissionsResult, candidatesResult, placementsResult, invoicesResult] = await Promise.all([
        fetchJob(id),
        fetchSubmissionsForJob(id),
        fetchCandidates('active'),
        fetchPlacementsForJob(id),
        fetchInvoicesForJob(id),
      ])
      setJob(jobResult)
      setValues(jobToFormValues(jobResult))
      setSubmissions(submissionsResult)
      setCandidates(candidatesResult)
      setPlacements(placementsResult)
      setInvoices(invoicesResult)
      setFirmContacts(await fetchFirmContacts(jobResult.firm_id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this job.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // React Router reuses this component instance across /jobs/:id
    // navigations, so state from the previous job must be cleared
    // explicitly - otherwise a selection or in-progress form for job A
    // is still sitting there (and actionable) once job B has loaded.
    setSelectedCandidateId('')
    setEditing(false)
    setRecordingFeeFor(null)
    setFeeForm({ startDate: '', salary: '', feeAmount: '', guaranteeEndDate: '' })
    setSendingInvoiceFor(null)
    setInvoiceForm({ contactPersonId: '', dueDays: '14' })
    setLastInvoiceLink(null)
    load()
  }, [id])

  async function handleSave() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await updateJob(id, values)
      setEditing(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRecordFee(submissionId: string) {
    setSavingFee(true)
    setError(null)
    try {
      await createPlacement({ submissionId, ...feeForm })
      setRecordingFeeFor(null)
      setFeeForm({ startDate: '', salary: '', feeAmount: '', guaranteeEndDate: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record this fee.')
    } finally {
      setSavingFee(false)
    }
  }

  async function handleSendInvoice(placementId: string) {
    if (!invoiceForm.contactPersonId) return
    setSendingInvoice(true)
    setError(null)
    try {
      const viewLink = await sendInvoice({
        placementId,
        contactPersonId: invoiceForm.contactPersonId,
        dueDays: invoiceForm.dueDays ? Number(invoiceForm.dueDays) : undefined,
      })
      setLastInvoiceLink(viewLink || null)
      setSendingInvoiceFor(null)
      setInvoiceForm({ contactPersonId: '', dueDays: '14' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this invoice.')
    } finally {
      setSendingInvoice(false)
    }
  }

  async function handleInvoiceStatusChange(placementId: string, status: (typeof INVOICE_STATUSES)[number]) {
    try {
      await setInvoiceStatus(placementId, status)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update invoice status.')
    }
  }

  async function handleAddCandidate() {
    if (!id || !selectedCandidateId) return
    try {
      await submitCandidateToJob(id, selectedCandidateId)
      setSelectedCandidateId('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this candidate to the pipeline.')
    }
  }

  async function handleStageChange(submissionId: string, stage: SubmissionStage) {
    try {
      await setSubmissionStage(submissionId, stage)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the pipeline stage.')
    }
  }

  async function handleStatusChange(status: JobStatus) {
    if (!id) return
    try {
      await setJobStatus(id, status)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update job status.')
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="text-sm text-sec">Loading…</p>
      </Layout>
    )
  }

  if (!job) {
    return (
      <Layout>
        <p className="text-sm text-ox">{error ?? 'Job not found.'}</p>
        <Link to="/jobs" className="mt-3 inline-block text-sm text-sec hover:underline">
          Back to jobs
        </Link>
      </Layout>
    )
  }

  const candidatesAlreadyInPipeline = new Set(submissions.map((s) => s.candidate_id))
  const availableCandidates = candidates.filter((c) => !candidatesAlreadyInPipeline.has(c.id))

  return (
    <Layout>
      <Link to="/jobs" className="text-sm text-sec hover:underline">
        ← Jobs
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold text-ink">{job.title}</h1>
          <p className="text-sm text-sec">{job.firms?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {!editing && <StatusBadge label={job.status.replace('_', ' ')} tone={jobStatusTone[job.status] ?? 'neutral'} />}
          {canManage && !editing && (
            <select
              value={job.status}
              onChange={(e) => handleStatusChange(e.target.value as JobStatus)}
              className="rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm capitalize"
            >
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          )}
          {canManage && (
            <>
              {editing ? (
                <>
                  <button
                    onClick={() => {
                      setEditing(false)
                      setValues(jobToFormValues(job))
                    }}
                    className="rounded-md border border-ink/20 px-3 py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift"
                >
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>
      )}

      {lastInvoiceLink && (
        <div className="mt-4 rounded-md border border-brass/40 bg-brass/10 p-3 text-sm">
          <p className="text-ink">
            Sent — no real email provider is connected yet, so here's the exact link the contact would get:
          </p>
          <a href={lastInvoiceLink} target="_blank" rel="noreferrer" className="break-all text-ox hover:underline">
            {lastInvoiceLink}
          </a>
          <button
            onClick={() => setLastInvoiceLink(null)}
            className="ml-2 align-baseline text-xs text-ink/40 hover:text-ox"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-ink/10 bg-paper p-5">
        {editing ? (
          <JobForm values={values} onChange={setValues} />
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Practice area" value={job.practice_area} />
            <Field label="Location" value={job.location} />
            <Field label="Employment type" value={job.employment_type} />
            <Field
              label="PQE range"
              value={
                job.min_pqe != null || job.max_pqe != null ? `${job.min_pqe ?? '—'} to ${job.max_pqe ?? '—'}` : null
              }
            />
            <Field
              label="Salary range"
              value={
                job.salary_min != null || job.salary_max != null
                  ? `$${job.salary_min?.toLocaleString() ?? '—'} to $${job.salary_max?.toLocaleString() ?? '—'}`
                  : null
              }
            />
            <Field label="Fee %" value={job.fee_percent != null ? `${job.fee_percent}%` : null} />
            <div className="col-span-2">
              <Field label="Description" value={job.description} />
            </div>
          </dl>
        )}
      </div>

      {!editing && canManage && (
        <div className="mt-4 flex gap-2">
          <select
            value={selectedCandidateId}
            onChange={(e) => setSelectedCandidateId(e.target.value)}
            className="flex-1 rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
          >
            <option value="">Add a candidate to this pipeline…</option>
            {availableCandidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddCandidate}
            disabled={!selectedCandidateId}
            className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <div className="flex gap-4" style={{ minWidth: SUBMISSION_STAGES.length * 200 }}>
          {SUBMISSION_STAGES.map((stage) => {
            const stageSubmissions = submissions.filter((s) => s.stage === stage)
            const tone = submissionStageTone[stage] ?? 'neutral'
            const columnBorder: Record<string, string> = {
              success: 'border-t-success',
              danger: 'border-t-ox',
              warning: 'border-t-brass',
              info: 'border-t-art',
              neutral: 'border-t-ink/20',
            }
            return (
              <div key={stage} className={`w-48 shrink-0 border-t-4 pt-2 ${columnBorder[tone]}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-sec">{stage}</h3>
                  <StatusBadge label={String(stageSubmissions.length)} tone={tone} />
                </div>
                <div className="mt-2 space-y-2">
                  {stageSubmissions.map((s) => (
                    <div key={s.id} className="rounded-lg border border-ink/10 bg-paper p-3">
                      <p className="text-sm font-medium text-ink">{candidateName(s)}</p>
                      {s.candidate_profiles?.current_title && (
                        <p className="text-xs text-sec">{s.candidate_profiles.current_title}</p>
                      )}
                      {s.stage === 'placed' && (
                        <div className="mt-1.5">
                          {(() => {
                            const placement = placements.find((p) => p.submission_id === s.id)
                            if (placement) {
                              return (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-success">
                                    Fee: {money(placement.fee_amount)}
                                  </p>
                                  {canManage && (
                                    <select
                                      value={placement.invoice_status}
                                      onChange={(e) =>
                                        handleInvoiceStatusChange(
                                          placement.id,
                                          e.target.value as (typeof INVOICE_STATUSES)[number],
                                        )
                                      }
                                      className={`w-full rounded-full border-0 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${TONE_CLASSES[invoiceStatusTone[placement.invoice_status] ?? 'neutral']}`}
                                    >
                                      {INVOICE_STATUSES.map((st) => (
                                        <option key={st} value={st}>
                                          {invoiceStatusLabels[st]}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  {canManage &&
                                    (() => {
                                      const invoice = invoices.find((inv) => inv.placement_id === placement.id)
                                      const contactsWithEmail = firmContacts.filter((c) => c.email)
                                      if (invoice) {
                                        return (
                                          <p className="text-xs text-ink/40">
                                            Invoice {invoice.invoice_number} sent{' '}
                                            {invoice.sent_at ? new Date(invoice.sent_at).toLocaleDateString() : '—'}
                                            {invoice.viewed_at && ' · viewed'}
                                          </p>
                                        )
                                      }
                                      if (sendingInvoiceFor === s.id) {
                                        return (
                                          <div className="space-y-1 rounded border border-ink/10 p-2">
                                            {contactsWithEmail.length === 0 ? (
                                              <p className="text-xs text-ink/40">
                                                Add a firm contact with an email first.
                                              </p>
                                            ) : (
                                              <>
                                                <select
                                                  value={invoiceForm.contactPersonId}
                                                  onChange={(e) =>
                                                    setInvoiceForm((f) => ({ ...f, contactPersonId: e.target.value }))
                                                  }
                                                  className="w-full rounded border border-ink/20 px-1.5 py-1 text-xs"
                                                >
                                                  <option value="">Send to…</option>
                                                  {contactsWithEmail.map((c) => (
                                                    <option key={c.person_id} value={c.person_id}>
                                                      {c.first_name} {c.last_name}
                                                    </option>
                                                  ))}
                                                </select>
                                                <input
                                                  type="number"
                                                  placeholder="Due (days)"
                                                  value={invoiceForm.dueDays}
                                                  onChange={(e) =>
                                                    setInvoiceForm((f) => ({ ...f, dueDays: e.target.value }))
                                                  }
                                                  className="w-full rounded border border-ink/20 px-1.5 py-1 text-xs"
                                                />
                                              </>
                                            )}
                                            <div className="flex gap-1">
                                              <button
                                                onClick={() => setSendingInvoiceFor(null)}
                                                className="flex-1 rounded border border-ink/20 px-1.5 py-1 text-xs text-sec"
                                              >
                                                Cancel
                                              </button>
                                              <button
                                                onClick={() => handleSendInvoice(placement.id)}
                                                disabled={sendingInvoice || !invoiceForm.contactPersonId}
                                                className="flex-1 rounded border-2 border-ox bg-ox px-1.5 py-1 text-xs font-semibold text-white hover:bg-ox-lift disabled:opacity-50"
                                              >
                                                {sendingInvoice ? 'Sending…' : 'Send'}
                                              </button>
                                            </div>
                                          </div>
                                        )
                                      }
                                      return (
                                        <button
                                          onClick={() => {
                                            setSendingInvoiceFor(s.id)
                                            setInvoiceForm({ contactPersonId: '', dueDays: '14' })
                                          }}
                                          className="text-xs text-ox hover:underline"
                                        >
                                          Send invoice →
                                        </button>
                                      )
                                    })()}
                                </div>
                              )
                            }
                            if (!canManage) return null
                            if (recordingFeeFor === s.id) {
                              return (
                                <div className="space-y-1 rounded border border-ink/10 p-2">
                                  <input
                                    type="date"
                                    placeholder="Start date"
                                    value={feeForm.startDate}
                                    onChange={(e) => setFeeForm((f) => ({ ...f, startDate: e.target.value }))}
                                    className="w-full rounded border border-ink/20 px-1.5 py-1 text-xs"
                                  />
                                  <input
                                    type="number"
                                    placeholder="Salary"
                                    value={feeForm.salary}
                                    onChange={(e) => setFeeForm((f) => ({ ...f, salary: e.target.value }))}
                                    className="w-full rounded border border-ink/20 px-1.5 py-1 text-xs"
                                  />
                                  <input
                                    type="number"
                                    placeholder="Fee amount"
                                    value={feeForm.feeAmount}
                                    onChange={(e) => setFeeForm((f) => ({ ...f, feeAmount: e.target.value }))}
                                    className="w-full rounded border border-ink/20 px-1.5 py-1 text-xs"
                                  />
                                  <input
                                    type="date"
                                    placeholder="Guarantee ends"
                                    value={feeForm.guaranteeEndDate}
                                    onChange={(e) => setFeeForm((f) => ({ ...f, guaranteeEndDate: e.target.value }))}
                                    className="w-full rounded border border-ink/20 px-1.5 py-1 text-xs"
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => setRecordingFeeFor(null)}
                                      className="flex-1 rounded border border-ink/20 px-1.5 py-1 text-xs text-sec"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleRecordFee(s.id)}
                                      disabled={savingFee}
                                      className="flex-1 rounded border-2 border-ox bg-ox px-1.5 py-1 text-xs font-semibold text-white hover:bg-ox-lift disabled:opacity-50"
                                    >
                                      {savingFee ? 'Saving…' : 'Save'}
                                    </button>
                                  </div>
                                </div>
                              )
                            }
                            return (
                              <button
                                onClick={() => {
                                  setRecordingFeeFor(s.id)
                                  setFeeForm({ startDate: '', salary: '', feeAmount: '', guaranteeEndDate: '' })
                                }}
                                className="text-xs text-ox hover:underline"
                              >
                                Record fee →
                              </button>
                            )
                          })()}
                        </div>
                      )}
                      {canManage && (
                        <select
                          value={s.stage}
                          onChange={(e) => handleStageChange(s.id, e.target.value as SubmissionStage)}
                          className="mt-2 w-full rounded border border-ink/20 bg-paper px-1.5 py-1 text-xs capitalize"
                        >
                          {SUBMISSION_STAGES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-ink/10 bg-paper p-5">
        <FileAttachments subjectType="jobs" subjectId={job.id} />
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
