import { useEffect, useState } from 'react'
import { CANDIDATE_STATUSES, type CandidateFormValues } from '@/lib/candidates'
import { fetchFirms, type Firm } from '@/lib/firms'

interface Props {
  values: CandidateFormValues
  onChange: (values: CandidateFormValues) => void
  emailDisabled?: boolean
}

export function CandidateForm({ values, onChange, emailDisabled }: Props) {
  const [firms, setFirms] = useState<Firm[]>([])

  useEffect(() => {
    fetchFirms('active')
      .then(setFirms)
      .catch(() => setFirms([]))
  }, [])

  function set<K extends keyof CandidateFormValues>(key: K, value: CandidateFormValues[K]) {
    onChange({ ...values, [key]: value })
  }

  function textField(key: keyof CandidateFormValues, id: string, label: string, opts?: { type?: string; required?: boolean }) {
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-sec">
          {label}
        </label>
        <input
          id={id}
          type={opts?.type ?? 'text'}
          required={opts?.required}
          disabled={id === 'c-email' && emailDisabled}
          value={values[key]}
          onChange={(e) => set(key, e.target.value)}
          className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm disabled:bg-tint"
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-sec">
          Personal details
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {textField('firstName', 'c-first', 'First name', { required: true })}
          {textField('lastName', 'c-last', 'Last name', { required: true })}
          {textField('preferredName', 'c-preferred', 'Preferred name')}
          {textField('email', 'c-email', 'Email (optional)', { type: 'email' })}
          {textField('phone', 'c-phone', 'Phone')}
          {textField('linkedinUrl', 'c-linkedin', 'LinkedIn URL')}
          {textField('location', 'c-location', 'Location')}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-sec">
          Practice
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {textField('currentTitle', 'c-title', 'Current title')}
          <div>
            <label htmlFor="c-firm" className="block text-sm font-medium text-sec">
              Current firm
            </label>
            <select
              id="c-firm"
              value={values.currentFirmId}
              onChange={(e) => set('currentFirmId', e.target.value)}
              className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
            >
              <option value="">—</option>
              {firms.map((firm) => (
                <option key={firm.id} value={firm.id}>
                  {firm.name}
                </option>
              ))}
            </select>
          </div>
          {textField('yearsPqe', 'c-pqe', 'Years PQE', { type: 'number' })}
          <div>
            <label htmlFor="c-status" className="block text-sm font-medium text-sec">
              Candidate status
            </label>
            <select
              id="c-status"
              value={values.candidateStatus}
              onChange={(e) => set('candidateStatus', e.target.value)}
              className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
            >
              {CANDIDATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {textField('practiceAreas', 'c-areas', 'Practice areas (comma-separated)')}
          {textField('admissionJurisdictions', 'c-jurisdictions', 'Admitted in (comma-separated)')}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-sec">
          Preferences
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {textField('desiredLocations', 'c-desired-locations', 'Desired locations (comma-separated)')}
          {textField('workPreferences', 'c-work-prefs', 'Work preferences (comma-separated)')}
          {textField('salaryCurrent', 'c-salary-current', 'Current salary', { type: 'number' })}
          {textField('salaryExpected', 'c-salary-expected', 'Expected salary', { type: 'number' })}
          {textField('availabilityDate', 'c-availability', 'Available from', { type: 'date' })}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-sec">Source</h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {textField('sourceType', 'c-source-type', 'Source (e.g. referral, LinkedIn)')}
          {textField('sourceDetail', 'c-source-detail', 'Source detail')}
        </div>
      </div>
    </div>
  )
}
