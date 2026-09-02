import { supabase } from '@/lib/supabase'
import { createCandidate, emptyCandidateForm, type CandidateFormValues } from '@/lib/candidates'
import { createFirmContact } from '@/lib/firms'
import { logActivity } from '@/lib/activities'

interface EntityMatch {
  id: string
  name: string
}

export interface CreateCandidateAction {
  type: 'create_candidate'
  firstName: string
  lastName: string
  email?: string
  phone?: string
  currentTitle?: string
  practiceAreas?: string[]
  yearsPqe?: number
  location?: string
  activityNote?: string
}

export interface CreateFirmContactAction {
  type: 'create_firm_contact'
  firmQuery: string
  firmMatch: EntityMatch | null
  firstName: string
  lastName: string
  email?: string
  phone?: string
  roleTitle?: string
  activityNote?: string
}

export interface LogActivityAction {
  type: 'log_activity'
  targetQuery: string
  targetKind: 'candidate' | 'firm_contact'
  targetMatch: EntityMatch | null
  body: string
  activityType: string
}

export type QuickAddAction = CreateCandidateAction | CreateFirmContactAction | LogActivityAction

export async function parseNote(text: string): Promise<{ actions: QuickAddAction[]; unresolved?: boolean }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const response = await fetch('/api/ai-parse-note', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ text }),
  })
  const body = (await response.json()) as { actions: QuickAddAction[]; unresolved?: boolean; error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Could not parse this note')
  return body
}

/** An action needs a piece of information the note didn't contain — the preview should let it be confirmed but skip it. */
export function actionIsExecutable(action: QuickAddAction): boolean {
  if (action.type === 'create_candidate') return !!action.email
  if (action.type === 'create_firm_contact') return !!action.email
  if (action.type === 'log_activity') return !!action.targetMatch
  return false
}

async function runAction(action: QuickAddAction): Promise<void> {
  if (action.type === 'create_candidate') {
    if (!action.email) return
    const values: CandidateFormValues = {
      ...emptyCandidateForm,
      firstName: action.firstName,
      lastName: action.lastName,
      email: action.email,
      phone: action.phone ?? '',
      currentTitle: action.currentTitle ?? '',
      practiceAreas: (action.practiceAreas ?? []).join(', '),
      yearsPqe: action.yearsPqe != null ? String(action.yearsPqe) : '',
      location: action.location ?? '',
    }
    const personId = await createCandidate(values)
    if (action.activityNote) {
      await logActivity('people', personId, action.activityNote, 'note')
    }
    return
  }

  if (action.type === 'create_firm_contact') {
    if (!action.email) return
    let firmId = action.firmMatch?.id
    if (!firmId) {
      const { data, error } = await supabase.from('firms').insert({ name: action.firmQuery }).select('id').single()
      if (error) throw error
      firmId = data.id
    }
    const personId = await createFirmContact(firmId, {
      firstName: action.firstName,
      lastName: action.lastName,
      email: action.email,
      phone: action.phone ?? '',
      roleTitle: action.roleTitle ?? '',
      isPrimary: false,
    })
    if (action.activityNote) {
      await logActivity('people', personId, action.activityNote, 'note')
    }
    return
  }

  if (action.type === 'log_activity') {
    if (!action.targetMatch) return
    await logActivity('people', action.targetMatch.id, action.body, action.activityType || 'note')
  }
}

export async function executeActions(actions: QuickAddAction[]): Promise<void> {
  for (const action of actions) {
    await runAction(action)
  }
}
