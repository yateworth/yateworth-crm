import type { Config, Context } from '@netlify/functions'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { getUnsubscribeTokenSecret } from './_shared/env'
import { verifyUnsubscribeToken } from './_shared/unsubscribeToken'

const VALID_SCOPES = new Set(['blog', 'recruitment', 'all_marketing'])

/**
 * Public, no-login unsubscribe endpoint, per the spec: works without
 * login, doesn't request any extra personal data, actions immediately.
 *
 * GET /api/unsubscribe?token=...&scope=blog|recruitment|all_marketing
 *
 * An invalid, tampered or expired token gets the same generic response
 * as a scope you got wrong — nothing here reveals whether an email
 * address exists or was ever valid.
 */
export default async (req: Request, _context: Context) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''
  const scope = url.searchParams.get('scope') ?? ''

  if (!VALID_SCOPES.has(scope)) {
    return new Response('This unsubscribe link is invalid or has expired.', { status: 400 })
  }

  const emailAddressId = verifyUnsubscribeToken(token, getUnsubscribeTokenSecret())
  if (!emailAddressId) {
    return new Response('This unsubscribe link is invalid or has expired.', { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin.rpc('record_unsubscribe', {
    p_email_address_id: emailAddressId,
    p_scope: scope,
    p_source: 'unsubscribe_link',
  })

  if (error) {
    console.error('unsubscribe: record_unsubscribe failed', error)
    return new Response('Something went wrong processing this request. Please try again shortly.', {
      status: 500,
    })
  }

  return new Response('You have been unsubscribed. This takes effect immediately.', { status: 200 })
}

export const config: Config = {
  path: '/api/unsubscribe',
}
