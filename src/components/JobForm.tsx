import { useEffect, useState } from 'react'
import type { JobFormValues } from '@/lib/jobs'
import { fetchFirms, type Firm } from '@/lib/firms'

interface Props {
  values: JobFormValues
  onChange: (values: JobFormValues) => void
}

export function JobForm({ values, onChange }: Props) {
  const [firms, setFirms] = useState<Firm[]>([])

  useEffect(() => {
    fetchFirms('active')
      .then(setFirms)
      .catch(() => setFirms([]))
  }, [])

  function set<K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="job-firm" className="block text-sm font-medium text-sec">
            Firm
          </label>
          <select
            id="job-firm"
            required
            value={values.firmId}
            onChange={(e) => set('firmId', e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
          >
            <option value="">Select a firm</option>
            {firms.map((firm) => (
              <option key={firm.id} value={firm.id}>
                {firm.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="job-title" className="block text-sm font-medium text-sec">
            Title
          </label>
          <input
            id="job-title"
            required
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="job-area" className="block text-sm font-medium text-sec">
            Practice area
          </label>
          <input
            id="job-area"
            value={values.practiceArea}
            onChange={(e) => set('practiceArea', e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="job-location" className="block text-sm font-medium text-sec">
            Location
          </label>
          <input
            id="job-location"
            value={values.location}
            onChange={(e) => set('location', e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="job-employment-type" className="block text-sm font-medium text-sec">
            Employment type
          </label>
          <input
            id="job-employment-type"
            value={values.employmentType}
            onChange={(e) => set('employmentType', e.target.value)}
            placeholder="e.g. Permanent, Contract"
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="job-min-pqe" className="block text-sm font-medium text-sec">
            Min PQE
          </label>
          <input
            id="job-min-pqe"
            type="number"
            value={values.minPqe}
            onChange={(e) => set('minPqe', e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="job-max-pqe" className="block text-sm font-medium text-sec">
            Max PQE
          </label>
          <input
            id="job-max-pqe"
            type="number"
            value={values.maxPqe}
            onChange={(e) => set('maxPqe', e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="job-salary-min" className="block text-sm font-medium text-sec">
            Salary min
          </label>
          <input
            id="job-salary-min"
            type="number"
            value={values.salaryMin}
            onChange={(e) => set('salaryMin', e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="job-salary-max" className="block text-sm font-medium text-sec">
            Salary max
          </label>
          <input
            id="job-salary-max"
            type="number"
            value={values.salaryMax}
            onChange={(e) => set('salaryMax', e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="job-fee" className="block text-sm font-medium text-sec">
            Fee %
          </label>
          <input
            id="job-fee"
            type="number"
            value={values.feePercent}
            onChange={(e) => set('feePercent', e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div>
        <label htmlFor="job-description" className="block text-sm font-medium text-sec">
          Description
        </label>
        <textarea
          id="job-description"
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
        />
      </div>
    </div>
  )
}
