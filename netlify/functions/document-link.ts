import type { Config, Context } from '@netlify/functions'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { getDocumentTokenSecret } from './_shared/env'
import { signDocumentToken, type DocumentTokenType } from './_shared/documentToken'

/**
 * Mints a fresh signed link for an already-created contract or invoice,
 * so staff can go back and preview what a recipient sees without having
 * to re-send (which would email them again) or dig through function
 * logs. Works for a contract/invoice in any status — sign-contract.ts/
 * view-invoice.ts already render the right thing (the form, or a
 * "signed"/"void" notice) for whichever status it's actually in.
 *
 * Requires a Supabase session belonging to an active admin or recruiter.
 */
const PATHS: Record<DocumentTokenType, string> = {
  contract: '/api/sign-contract',
  invoice: '/api/view-invoice',
}
const TABLES: Record<DocumentTokenType, string> = {
  contract: 'firm_contracts',
  invoice: 'invoices',
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

  let body: { type?: DocumentTokenType; id?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.id || (body.type !== 'contract' && body.type !== 'invoice')) {
    return Response.json({ error: 'type ("contract" or "invoice") and id are required' }, { status: 400 })
  }

  const { data: row } = await admin.from(TABLES[body.type]).select('id').eq('id', body.id).maybeSingle()
  if (!row) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const siteUrl = process.env.URL ?? process.env.DEPLOY_PRIME_URL
  const link = `${siteUrl}${PATHS[body.type]}?token=${signDocumentToken(body.id, body.type, getDocumentTokenSecret())}`

  return Response.json({ link })
}

export const config: Config = {
  path: '/api/document-link',
}
