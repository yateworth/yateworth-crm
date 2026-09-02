import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJob, setJobStatus, type JobWithFirm, type JobStatus } from '@/lib/jobs'
import {
  fetchSubmissionsForJob,
  submitCandidateToJob,
  setSubmissionStage,
  SUBMISSION_STAGES,
  type SubmissionWithCandidate,
  type SubmissionStage,
} from '@/lib/submissions'
import { fetchCandidates, type Candidate } from '@/lib/candidates'

const JOB_STATUSES: JobStatus[] = ['draft', 'open', 'on_hold', 'filled', 'closed', 'cancelled']

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
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const [jobResult, submissionsResult, candidatesResult] = await Promise.all([
        fetchJob(id),
        fetchSubmissionsForJob(id),
        fetchCandidates('active'),
      ])
      setJob(jobResult)
      setSubmissions(submissionsResult)
      setCandidates(candidatesResult)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this job.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

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
        {canManage && (
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
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>
      )}

      {canManage && (
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
            className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <div className="flex gap-4" style={{ minWidth: SUBMISSION_STAGES.length * 200 }}>
          {SUBMISSION_STAGES.map((stage) => {
            const stageSubmissions = submissions.filter((s) => s.stage === stage)
            return (
              <div key={stage} className="w-48 shrink-0">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-sec">
                  {stage} <span className="text-ink/40">({stageSubmissions.length})</span>
                </h3>
                <div className="mt-2 space-y-2">
                  {stageSubmissions.map((s) => (
                    <div key={s.id} className="rounded-lg border border-ink/10 bg-paper p-3">
                      <p className="text-sm font-medium text-ink">{candidateName(s)}</p>
                      {s.candidate_profiles?.current_title && (
                        <p className="text-xs text-sec">{s.candidate_profiles.current_title}</p>
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
    </Layout>
  )
}
