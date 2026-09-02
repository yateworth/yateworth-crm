import type { Config, Context } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { getAnthropicEnv } from './_shared/env'

/**
 * Turns a free-text note ("Had a call with Jane at Smith & Co, 5 PQE
 * corporate lawyer, jane@example.com") into a structured plan the client
 * previews and confirms before anything is written. This function only
 * reads the database (to resolve firm/candidate names against existing
 * records) and calls Claude — it never writes anything itself. Once
 * confirmed, the client executes the plan through the exact same
 * create_candidate/create_firm_contact/logActivity paths the manual
 * forms already use, so parsing is the only part that's new; writing
 * isn't.
 *
 * Requires a Supabase session belonging to an active admin or recruiter.
 */

interface CreateCandidateAction {
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

interface CreateFirmContactAction {
  type: 'create_firm_contact'
  firmQuery: string
  firmMatch: { id: string; name: string } | null
  firstName: string
  lastName: string
  email?: string
  phone?: string
  roleTitle?: string
  activityNote?: string
}

interface LogActivityAction {
  type: 'log_activity'
  targetQuery: string
  targetKind: 'candidate' | 'firm_contact'
  targetMatch: { id: string; name: string } | null
  body: string
  activityType: string
}

type QuickAddAction = CreateCandidateAction | CreateFirmContactAction | LogActivityAction

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_candidate',
    description: 'Add a new candidate (job seeker) to the CRM.',
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string', description: 'Omit entirely if not mentioned in the note.' },
        phone: { type: 'string' },
        currentTitle: { type: 'string' },
        practiceAreas: { type: 'array', items: { type: 'string' } },
        yearsPqe: { type: 'number' },
        location: { type: 'string' },
        activityNote: {
          type: 'string',
          description: 'A short summary of any interaction (call, email, meeting) described in the note about this person.',
        },
      },
      required: ['firstName', 'lastName'],
    },
  },
  {
    name: 'create_firm_contact',
    description: 'Add a new contact person at a law firm — e.g. an HR manager or hiring partner. Not for candidates.',
    input_schema: {
      type: 'object',
      properties: {
        firmName: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string', description: 'Omit entirely if not mentioned in the note.' },
        phone: { type: 'string' },
        roleTitle: { type: 'string' },
        activityNote: { type: 'string' },
      },
      required: ['firmName', 'firstName', 'lastName'],
    },
  },
  {
    name: 'log_activity',
    description:
      'Log an interaction against an EXISTING candidate or firm contact already in the CRM — use only when no new person needs to be created.',
    input_schema: {
      type: 'object',
      properties: {
        targetName: { type: 'string' },
        targetKind: { type: 'string', enum: ['candidate', 'firm_contact'] },
        body: { type: 'string' },
        activityType: { type: 'string', enum: ['call', 'email', 'meeting', 'note'] },
      },
      required: ['targetName', 'targetKind', 'body'],
    },
  },
]

const SYSTEM_PROMPT = `You are a data-entry assistant for a legal recruitment CRM. Read the recruiter's note and call the appropriate tools to represent every distinct new record or logged interaction it describes. Only call tools for things clearly stated in the note — never invent a detail (an email, a PQE number, a practice area) that isn't there. If the note only describes an interaction with someone already in the CRM (no new person to add), use log_activity. If it introduces a new candidate or a new firm contact, use create_candidate or create_firm_contact — and if the note also describes an interaction with that same new person, put it in that action's activityNote rather than a separate log_activity call.`

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) {
    return Response.json({ error: 'Missing Authorization header' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) {
    return Response.json({ error: 'Invalid session' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile || !profile.active || !['admin', 'recruiter'].includes(profile.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { text?: string }
  try {
    body = (await req.json()) as { text?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.text || !body.text.trim()) {
    return Response.json({ error: 'text is required' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey: getAnthropicEnv().apiKey })

  let message: Anthropic.Message
  try {
    message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: [{ role: 'user', content: body.text }],
    })
  } catch (err) {
    console.error('ai-parse-note: Anthropic call failed', err)
    return Response.json({ error: 'Could not reach the AI service' }, { status: 502 })
  }

  const toolUses = message.content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )

  if (toolUses.length === 0) {
    return Response.json({ actions: [], unresolved: true })
  }

  const actions: QuickAddAction[] = []

  for (const use of toolUses) {
    if (use.name === 'create_candidate') {
      const input = use.input as Omit<CreateCandidateAction, 'type'>
      actions.push({ type: 'create_candidate', ...input })
    } else if (use.name === 'create_firm_contact') {
      const input = use.input as Omit<CreateFirmContactAction, 'type' | 'firmMatch' | 'firmQuery'> & {
        firmName: string
      }
      const { data: firmMatch } = await admin
        .from('firms')
        .select('id, name')
        .ilike('name', `%${input.firmName}%`)
        .limit(1)
        .maybeSingle()
      const { firmName, ...rest } = input
      actions.push({ type: 'create_firm_contact', ...rest, firmQuery: firmName, firmMatch: firmMatch ?? null })
    } else if (use.name === 'log_activity') {
      const input = use.input as Omit<LogActivityAction, 'type' | 'targetMatch' | 'targetQuery'> & {
        targetName: string
      }
      let targetMatch: { id: string; name: string } | null = null

      if (input.targetKind === 'candidate') {
        const { data } = await admin
          .from('people')
          .select('id, first_name, last_name, candidate_profiles!inner(person_id)')
          .or(`first_name.ilike.%${input.targetName}%,last_name.ilike.%${input.targetName}%`)
          .limit(1)
          .maybeSingle()
        if (data) targetMatch = { id: data.id, name: `${data.first_name} ${data.last_name}` }
      } else {
        const { data } = await admin
          .from('people')
          .select('id, first_name, last_name, firm_contacts!inner(person_id)')
          .or(`first_name.ilike.%${input.targetName}%,last_name.ilike.%${input.targetName}%`)
          .limit(1)
          .maybeSingle()
        if (data) targetMatch = { id: data.id, name: `${data.first_name} ${data.last_name}` }
      }

      const { targetName, ...rest } = input
      actions.push({ type: 'log_activity', ...rest, targetQuery: targetName, targetMatch })
    }
  }

  return Response.json({ actions })
}

export const config: Config = {
  path: '/api/ai-parse-note',
}
