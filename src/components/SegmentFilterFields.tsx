import { CANDIDATE_STATUSES } from '@/lib/candidates'
import type { ContactType, PermissionPurpose, SegmentFilter } from '@/lib/campaigns'

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: 'any', label: 'Anyone (candidates, firm contacts, and subscribers)' },
  { value: 'candidate', label: 'Candidates only' },
  { value: 'firm_contact', label: 'Firm contacts only' },
  { value: 'subscriber', label: 'Subscribers only (no candidate/firm record)' },
]

interface Props {
  filter: SegmentFilter
  onChange: (filter: SegmentFilter) => void
}

/**
 * The compound filter form shared between the ad-hoc Compose flow and a
 * saved "smart" mailing list — same shape, same select_segment_email_ids
 * interpretation (migration 23), just two different places to reach it
 * from. Fields that don't apply to the chosen contact type stay hidden
 * rather than merely disabled, since a subscriber has no PQE or practice
 * area to filter on at all.
 */
export function SegmentFilterFields({ filter, onChange }: Props) {
  const contactType = filter.contact_type ?? 'any'
  const showCandidateFields = contactType === 'any' || contactType === 'candidate'
  const showPracticeAreas = contactType !== 'subscriber'

  function set<K extends keyof SegmentFilter>(key: K, value: SegmentFilter[K] | undefined) {
    const next = { ...filter, [key]: value }
    if (value === undefined || value === '') delete next[key]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="segment-contact-type" className="block text-sm font-medium text-sec">
          Who
        </label>
        <select
          id="segment-contact-type"
          value={contactType}
          onChange={(e) => set('contact_type', e.target.value as ContactType)}
          className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
        >
          {CONTACT_TYPES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {showPracticeAreas && (
        <div>
          <label htmlFor="segment-practice-areas" className="block text-sm font-medium text-sec">
            Practice area(s)
          </label>
          <input
            id="segment-practice-areas"
            value={filter.practice_areas?.join(', ') ?? ''}
            onChange={(e) => {
              const areas = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
              set('practice_areas', areas.length > 0 ? areas : undefined)
            }}
            placeholder="e.g. Banking & Finance, Corporate — leave blank for any"
            className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-ink/40">
            Matches a candidate's own practice areas, or — for firm contacts — the firm's practice areas.
          </p>
        </div>
      )}

      {showCandidateFields && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="segment-pqe-min" className="block text-sm font-medium text-sec">
                Min PQE
              </label>
              <input
                id="segment-pqe-min"
                type="number"
                value={filter.pqe_min ?? ''}
                onChange={(e) => set('pqe_min', e.target.value ? Number(e.target.value) : undefined)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="segment-pqe-max" className="block text-sm font-medium text-sec">
                Max PQE
              </label>
              <input
                id="segment-pqe-max"
                type="number"
                value={filter.pqe_max ?? ''}
                onChange={(e) => set('pqe_max', e.target.value ? Number(e.target.value) : undefined)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="segment-candidate-status" className="block text-sm font-medium text-sec">
              Candidate status
            </label>
            <select
              id="segment-candidate-status"
              value={filter.candidate_status ?? ''}
              onChange={(e) => set('candidate_status', e.target.value || undefined)}
              className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
            >
              <option value="">Any status</option>
              {CANDIDATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div>
        <label htmlFor="segment-opted-in" className="block text-sm font-medium text-sec">
          Opted into
        </label>
        <select
          id="segment-opted-in"
          value={filter.opted_in_purpose ?? ''}
          onChange={(e) => set('opted_in_purpose', (e.target.value || undefined) as PermissionPurpose | undefined)}
          className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
        >
          <option value="">Anyone (no opt-in filter)</option>
          <option value="blog">Blog</option>
          <option value="recruitment">Recruitment</option>
          <option value="report">Report</option>
        </select>
      </div>
    </div>
  )
}

export function describeFilter(filter: SegmentFilter | null): string {
  if (!filter || Object.keys(filter).length === 0) return 'Static list'
  const parts: string[] = []
  const who = CONTACT_TYPES.find((c) => c.value === (filter.contact_type ?? 'any'))
  if (filter.contact_type && filter.contact_type !== 'any') parts.push(who?.label ?? filter.contact_type)
  if (filter.practice_areas?.length) parts.push(filter.practice_areas.join('/'))
  if (filter.pqe_min != null || filter.pqe_max != null) {
    parts.push(`PQE ${filter.pqe_min ?? '0'}–${filter.pqe_max ?? '∞'}`)
  }
  if (filter.candidate_status) parts.push(filter.candidate_status)
  if (filter.opted_in_purpose) parts.push(`opted into ${filter.opted_in_purpose}`)
  return parts.length > 0 ? parts.join(' · ') : 'Everyone'
}
