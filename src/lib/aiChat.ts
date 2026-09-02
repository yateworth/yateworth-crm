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

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatResponse {
  text: string | null
  actions: QuickAddAction[]
}

export async function sendChatMessage(transcript: ChatTurn[]): Promise<ChatResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const response = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ transcript }),
  })
  const responseBody = (await response.json()) as ChatResponse & { error?: string }
  if (!response.ok) throw new Error(responseBody.error ?? 'Could not reach the assistant')
  return responseBody
}

/** An action needs a piece of information the conversation didn't contain yet. */
export function actionIsExecutable(action: QuickAddAction): boolean {
  if (action.type === 'create_candidate') return !!action.email
  if (action.type === 'create_firm_contact') return !!action.email
  if (action.type === 'log_activity') return !!action.targetMatch
  return false
}

/** A short plain-English record of the outcome, folded into the next turn so the assistant keeps context. */
export async function runAction(action: QuickAddAction): Promise<string> {
  if (action.type === 'create_candidate') {
    if (!action.email) return `Could not create ${action.firstName} ${action.lastName} — no email address.`
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
    return `Created candidate ${action.firstName} ${action.lastName}.`
  }

  if (action.type === 'create_firm_contact') {
    if (!action.email) return `Could not create contact ${action.firstName} ${action.lastName} — no email address.`
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
    return `Created firm contact ${action.firstName} ${action.lastName} at ${action.firmMatch?.name ?? action.firmQuery}.`
  }

  if (!action.targetMatch) return `Could not log this — no matching record found for "${action.targetQuery}".`
  await logActivity('people', action.targetMatch.id, action.body, action.activityType || 'note')
  return `Logged an activity against ${action.targetMatch.name}.`
}
