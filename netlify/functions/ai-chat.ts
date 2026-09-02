import type { Config, Context } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { getAnthropicEnv } from './_shared/env'

/**
 * A conversational CRM assistant: can answer questions about candidates,
 * firms and what needs attention (read tools, looped server-side within
 * one request so Claude gets the data back and can answer in prose), and
 * can propose adding a candidate, a firm contact, or an activity log
 * (write tools) — proposals only, never executed here. The client shows
 * a preview card and only writes to the database on explicit confirm,
 * through the same createCandidate/createFirmContact/logActivity paths
 * the manual forms use.
 *
 * Deliberately stateless between requests: the client resends the whole
 * conversation as plain text each turn (see src/lib/aiChat.ts) rather
 * than persisting raw Anthropic message objects. Simpler and more
 * robust than round-tripping tool_use/tool_result pairs across separate
 * HTTP requests, at the cost of write-tool confirmations being folded
 * back in as a bracketed note on the next turn rather than a proper
 * tool_result — acceptable for a short back-and-forth like this.
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

const WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'create_candidate',
    description: 'Propose adding a new candidate (job seeker) to the CRM. Does not save anything by itself.',
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        currentTitle: { type: 'string' },
        practiceAreas: { type: 'array', items: { type: 'string' } },
        yearsPqe: { type: 'number' },
        location: { type: 'string' },
        activityNote: {
          type: 'string',
          description: 'A short summary of any interaction (call, email, meeting) described about this person.',
        },
      },
      required: ['firstName', 'lastName'],
    },
  },
  {
    name: 'create_firm_contact',
    description:
      'Propose adding a new contact person at a law firm (HR manager, hiring partner) — not a candidate. Does not save anything by itself.',
    input_schema: {
      type: 'object',
      properties: {
        firmName: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
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
      'Propose logging an interaction against an EXISTING candidate or firm contact. Use only when no new person needs to be created. Does not save anything by itself.',
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

const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_candidates',
    description: 'Search existing candidates by name and/or practice area, to answer a question about them.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        practiceArea: { type: 'string' },
        status: { type: 'string', enum: ['prospective', 'active', 'submitted', 'placed', 'inactive'] },
      },
    },
  },
  {
    name: 'search_firms',
    description: 'Search existing firms by name, to answer a question about them.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
    },
  },
  {
    name: 'get_attention_needed',
    description:
      'Get candidates not contacted recently, jobs open with no submissions, and firm relationships gone quiet — use this for any question about who/what needs follow-up.',
    input_schema: { type: 'object', properties: {} },
  },
]

const READ_TOOL_NAMES = new Set(READ_TOOLS.map((t) => t.name))

const SYSTEM_PROMPT = `You are the assistant inside a legal recruitment CRM, talking with a recruiter or admin. You can:
- Answer questions about candidates, firms, and what needs follow-up, using the search/get tools.
- Propose adding a new candidate, a new firm contact, or logging an activity against an existing person, using the create_candidate/create_firm_contact/log_activity tools. These only propose — the recruiter confirms in the UI before anything saves.

Critical: when the user's message contains a detail that maps to a tool field — an email address, a phone number, years of PQE, a practice area, a job title — you MUST put it in that field on the tool call. Never leave a field empty when the information is right there in the message; that is the single most common mistake to avoid. An email address is NOT required to create a candidate or firm contact — a name alone is enough, and it can always be added later. Only ask a clarifying question when you genuinely cannot proceed without an answer (which is rare — prefer proposing the action with whatever you have over asking). Never invent a fact that wasn't given to you.

Keep replies to 1-2 short sentences — this is a compact chat panel, not an essay.`

async function executeReadTool(
  admin: ReturnType<typeof getSupabaseAdmin>,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (name === 'search_candidates') {
    let query = admin
      .from('people')
      .select('id, first_name, last_name, candidate_profiles!inner(current_title, practice_areas, years_pqe, candidate_status, last_contacted_at)')
      .eq('status', 'active')
      .limit(10)
    if (input.name) query = query.or(`first_name.ilike.%${input.name}%,last_name.ilike.%${input.name}%`)
    if (input.status) query = query.eq('candidate_profiles.candidate_status', input.status as string)
    const { data, error } = await query
    if (error) return { error: error.message }
    const filtered = input.practiceArea
      ? (data ?? []).filter((p) => {
          const profile = p.candidate_profiles as unknown as { practice_areas: string[] } | null
          return profile?.practice_areas?.some((a) => a.toLowerCase().includes((input.practiceArea as string).toLowerCase()))
        })
      : data
    return filtered
  }

  if (name === 'search_firms') {
    let query = admin.from('firms').select('id, name, relationship_stage, practice_areas').eq('status', 'active').limit(10)
    if (input.name) query = query.ilike('name', `%${input.name}%`)
    const { data, error } = await query
    return error ? { error: error.message } : data
  }

  if (name === 'get_attention_needed') {
    const { data, error } = await admin.rpc('insights_dashboard')
    return error ? { error: error.message } : data
  }

  return { error: 'unknown tool' }
}

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

  let body: { transcript?: { role: 'user' | 'assistant'; text: string }[] }
  try {
    body = (await req.json()) as { transcript?: { role: 'user' | 'assistant'; text: string }[] }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.transcript || body.transcript.length === 0) {
    return Response.json({ error: 'transcript is required' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey: getAnthropicEnv().apiKey })

  const messages: Anthropic.MessageParam[] = body.transcript.map((m) => ({
    role: m.role,
    content: m.text,
  }))

  let finalText: string | null = null
  let writeActions: QuickAddAction[] = []

  for (let round = 0; round < 4; round++) {
    let response: Anthropic.Message
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        tools: [...WRITE_TOOLS, ...READ_TOOLS],
        messages,
      })
    } catch (err) {
      console.error('ai-chat: Anthropic call failed', err)
      return Response.json({ error: 'Could not reach the AI service' }, { status: 502 })
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    )
    finalText = textBlocks.map((b) => b.text).join('\n').trim() || null

    const readCalls = toolUses.filter((t) => READ_TOOL_NAMES.has(t.name))
    const writeCalls = toolUses.filter((t) => !READ_TOOL_NAMES.has(t.name))

    if (writeCalls.length > 0) {
      writeActions = await resolveWriteActions(admin, writeCalls)
      break
    }

    if (readCalls.length === 0) {
      break
    }

    messages.push({ role: 'assistant', content: response.content })
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const call of readCalls) {
      const result = await executeReadTool(admin, call.name, call.input as Record<string, unknown>)
      toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(result) })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return Response.json({ text: finalText, actions: writeActions })
}

async function resolveWriteActions(
  admin: ReturnType<typeof getSupabaseAdmin>,
  toolUses: Anthropic.ToolUseBlock[],
): Promise<QuickAddAction[]> {
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

  return actions
}

export const config: Config = {
  path: '/api/ai-chat',
}
