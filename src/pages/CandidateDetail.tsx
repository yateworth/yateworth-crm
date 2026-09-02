import { useEffect, useState, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { CandidateForm } from '@/components/CandidateForm'
import { ActivityFeed } from '@/components/ActivityFeed'
import { TaskList } from '@/components/TaskList'
import { SendEmailForm } from '@/components/SendEmailForm'
import { FileAttachments } from '@/components/FileAttachments'
import { StatusBadge, candidateStatusTone, submissionStageTone } from '@/components/StatusBadge'
import { useAuth } from '@/contexts/AuthContext'
import { fetchSubmissionsForCandidate, type SubmissionWithJob } from '@/lib/submissions'
import {
  fetchCandidate,
  updateCandidate,
  setCandidateStatus,
  setPrivacyNoticeGiven,
  logContactNow,
  candidateToFormValues,
  primaryEmail,
  emptyCandidateForm,
  type Candidate,
  type CandidateFormValues,
} from '@/lib/candidates'

export function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'recruiter'

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionWithJob[]>([])
  const [values, setValues] = useState<CandidateFormValues>(emptyCandidateForm)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activityRefreshKey, setActivityRefreshKey] = useState(0)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const [data, submissionsResult] = await Promise.all([
        fetchCandidate(id),
        fetchSubmissionsForCandidate(id),
      ])
      setCandidate(data)
      setValues(candidateToFormValues(data))
      setSubmissions(submissionsResult)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this candidate.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  async function handleSave() {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await updateCandidate(id, values)
      setEditing(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveToggle() {
    if (!id || !candidate) return
    try {
      await setCandidateStatus(id, candidate.status === 'active' ? 'archived' : 'active')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status.')
    }
  }

  async function handlePrivacyToggle() {
    if (!id || !candidate) return
    try {
      await setPrivacyNoticeGiven(id, !candidate.candidate_profiles?.privacy_notice_at)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update privacy notice status.')
    }
  }

  async function handleLogContact() {
    if (!id) return
    try {
      await logContactNow(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log contact.')
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="text-sm text-sec">Loading…</p>
      </Layout>
    )
  }

  if (!candidate) {
    return (
      <Layout>
        <p className="text-sm text-ox">{error ?? 'Candidate not found.'}</p>
        <Link to="/candidates" className="mt-3 inline-block text-sm text-sec hover:underline">
          Back to candidates
        </Link>
      </Layout>
    )
  }

  const profileData = candidate.candidate_profiles

  return (
    <Layout>
      <Link to="/candidates" className="text-sm text-sec hover:underline">
        ← Candidates
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold text-ink">
          {candidate.first_name} {candidate.last_name}
        </h1>
        {canManage && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    setEditing(false)
                    setValues(candidateToFormValues(candidate))
                  }}
                  className="rounded-md border border-ink/20 px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleLogContact}
                  className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-sec"
                >
                  Log contact
                </button>
                <button
                  onClick={handleArchiveToggle}
                  className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-sec"
                >
                  {candidate.status === 'active' ? 'Archive' : 'Restore'}
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift"
                >
                  Edit
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        {candidate.status === 'archived' && (
          <span className="inline-block rounded-full bg-tint px-2.5 py-1 text-xs font-medium text-sec">
            Archived
          </span>
        )}
        {profileData?.candidate_status && (
          <StatusBadge
            label={profileData.candidate_status}
            tone={candidateStatusTone[profileData.candidate_status] ?? 'neutral'}
          />
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">
          {error}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-ink/10 bg-paper p-5">
        {editing ? (
          <CandidateForm values={values} onChange={setValues} emailDisabled />
        ) : (
          <div className="space-y-5">
            <Section title="Personal details">
              <Field label="Preferred name" value={candidate.preferred_name} />
              <Field label="Email" value={primaryEmail(candidate)} />
              <Field label="Phone" value={candidate.phone} />
              <Field
                label="LinkedIn"
                value={
                  candidate.linkedin_url ? (
                    <a href={candidate.linkedin_url} target="_blank" rel="noreferrer" className="hover:underline">
                      {candidate.linkedin_url}
                    </a>
                  ) : null
                }
              />
              <Field label="Location" value={candidate.location} />
            </Section>

            <Section title="Practice">
              <Field label="Current title" value={profileData?.current_title} />
              <Field label="Years PQE" value={profileData?.years_pqe?.toString()} />
              <Field label="Practice areas" value={profileData?.practice_areas.join(', ')} />
              <Field label="Admitted in" value={profileData?.admission_jurisdictions.join(', ')} />
            </Section>

            <Section title="Preferences">
              <Field label="Desired locations" value={profileData?.desired_locations.join(', ')} />
              <Field label="Work preferences" value={profileData?.work_preferences.join(', ')} />
              <Field
                label="Current salary"
                value={profileData?.salary_current != null ? `$${profileData.salary_current.toLocaleString()}` : null}
              />
              <Field
                label="Expected salary"
                value={profileData?.salary_expected != null ? `$${profileData.salary_expected.toLocaleString()}` : null}
              />
              <Field label="Available from" value={profileData?.availability_date} />
            </Section>

            <Section title="Source & compliance">
              <Field label="Source" value={candidate.source_type} />
              <Field label="Source detail" value={candidate.source_detail} />
              <Field
                label="Privacy notice"
                value={
                  <button onClick={handlePrivacyToggle} className="text-left hover:underline">
                    {profileData?.privacy_notice_at
                      ? `Given ${new Date(profileData.privacy_notice_at).toLocaleDateString()}`
                      : 'Not yet given — click to mark as given'}
                  </button>
                }
              />
              <Field
                label="Last contacted"
                value={
                  profileData?.last_contacted_at
                    ? new Date(profileData.last_contacted_at).toLocaleString()
                    : 'Never'
                }
              />
            </Section>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-ink/10 bg-paper p-5">
        <h3 className="font-display text-sm font-semibold text-ink">
          Submitted to <span className="text-ink/40">({submissions.length})</span>
        </h3>
        {submissions.length === 0 ? (
          <p className="mt-2 text-sm text-ink/40">
            Not yet submitted to any role. Add them to a pipeline from the{' '}
            <Link to="/jobs" className="underline">
              Jobs
            </Link>{' '}
            page.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {submissions.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between">
                <span className="text-ink">
                  {s.jobs?.title} <span className="text-sec">— {s.jobs?.firms?.name}</span>
                </span>
                <StatusBadge label={s.stage} tone={submissionStageTone[s.stage] ?? 'neutral'} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && (
        <div className="mt-6">
          <SendEmailForm personId={candidate.id} onSent={() => setActivityRefreshKey((k) => k + 1)} />
        </div>
      )}

      <div className="mt-6 rounded-lg border border-ink/10 bg-paper p-5">
        <FileAttachments subjectType="people" subjectId={candidate.id} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-ink/10 bg-paper p-5">
          <TaskList subjectType="people" subjectId={candidate.id} />
        </div>
        <div className="rounded-lg border border-ink/10 bg-paper p-5">
          <ActivityFeed key={activityRefreshKey} subjectType="people" subjectId={candidate.id} />
        </div>
      </div>
    </Layout>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-sec">{title}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-4 text-sm">{children}</dl>
    </div>
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
