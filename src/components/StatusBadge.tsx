export type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral' | 'info'

export const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-success/15 text-success',
  danger: 'bg-ox/10 text-ox',
  warning: 'bg-brass/30 text-ink',
  neutral: 'bg-ink/10 text-ink/60',
  info: 'bg-art/20 text-ink',
}

export function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  )
}

export const jobStatusTone: Record<string, BadgeTone> = {
  draft: 'neutral',
  open: 'info',
  on_hold: 'warning',
  filled: 'success',
  closed: 'neutral',
  cancelled: 'danger',
}

export const candidateStatusTone: Record<string, BadgeTone> = {
  prospective: 'neutral',
  active: 'info',
  submitted: 'warning',
  placed: 'success',
  inactive: 'neutral',
}

export const invoiceStatusTone: Record<string, BadgeTone> = {
  not_invoiced: 'neutral',
  invoiced: 'warning',
  paid: 'success',
  written_off: 'danger',
}

export const relationshipStageTone: Record<string, BadgeTone> = {
  prospect: 'neutral',
  contacted: 'info',
  terms_sent: 'warning',
  terms_signed: 'success',
  dormant: 'danger',
}

export const campaignStatusTone: Record<string, BadgeTone> = {
  draft: 'neutral',
  scheduled: 'warning',
  sending: 'info',
  paused: 'neutral',
  completed: 'success',
  cancelled: 'danger',
}

export const surveyStatusTone: Record<string, BadgeTone> = {
  draft: 'neutral',
  open: 'success',
  closed: 'neutral',
}

export const contractStatusTone: Record<string, BadgeTone> = {
  draft: 'neutral',
  sent: 'warning',
  signed: 'success',
  void: 'danger',
}

export const submissionStageTone: Record<string, BadgeTone> = {
  longlist: 'neutral',
  shortlist: 'neutral',
  submitted: 'info',
  interview: 'warning',
  offer: 'warning',
  placed: 'success',
  rejected: 'danger',
  withdrawn: 'danger',
}
