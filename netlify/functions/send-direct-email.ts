import type { Config, Context } from '@netlify/functions'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { createFakeEmailProvider } from './_shared/emailProvider'
import { getEmailWebhookSecret } from './_shared/env'

/**
 * A one-off email from a recruiter directly to a candidate or firm
 * contact — genuinely different from a campaign send, not a smaller
 * version of one. can_send_email()'s purpose-based opt-in ledger exists
 * for marketing/bulk sends where consent tracking is the point; direct
 * 1:1 correspondence with your own candidate is ordinary business
 * contact and was never gated behind an opt-in checkbox on a form. This
 * still checks the one suppression that always matters regardless of
 * purpose — all_email (hard bounce, complaint, legal request) — so a
 * recruiter can never send straight past a bounced or blocked address by
 * using this instead of a campaign. No unsubscribe footer either, for
 * the same reason a personal email from a colleague doesn't carry one.
 *
 * Requires a Supabase session belonging to an active admin or recruiter.
 */
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

  let body: { personId?: string; subject?: string; text?: string }
  try {
    body = (await req.json()) as { personId?: string; subject?: string; text?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.personId || !body.subject || !body.text) {
    return Response.json({ error: 'personId, subject and text are required' }, { status: 400 })
  }

  const { data: emailRow, error: emailError } = await admin
    .from('email_addresses')
    .select('id, email')
    .eq('person_id', body.personId)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (emailError || !emailRow) {
    return Response.json({ error: 'This person has no email address on file' }, { status: 404 })
  }

  const { data: suppression } = await admin
    .from('suppression_entries')
    .select('reason')
    .eq('email_address_id', emailRow.id)
    .eq('scope', 'all_email')
    .eq('active', true)
    .maybeSingle()

  if (suppression) {
    return Response.json(
      { error: `This address is suppressed (${suppression.reason}) and cannot be emailed.` },
      { status: 409 },
    )
  }

  const provider = createFakeEmailProvider(getEmailWebhookSecret())
  const html = body.text.replace(/\n/g, '<br>')

  let providerMessageId: string
  try {
    const result = await provider.send({ to: emailRow.email, subject: body.subject, html, text: body.text })
    providerMessageId = result.providerMessageId
  } catch (err) {
    console.error('send-direct-email: provider send failed', err)
    return Response.json({ error: 'Could not send this email' }, { status: 502 })
  }

  await admin.from('email_messages').insert({
    email_address_id: emailRow.id,
    purpose: 'recruitment',
    provider: provider.name,
    provider_message_id: providerMessageId,
    subject_snapshot: body.subject,
    status: 'sent',
    sent_at: new Date().toISOString(),
  })

  await admin.from('activities').insert({
    subject_type: 'people',
    subject_id: body.personId,
    activity_type: 'email',
    body: `Subject: ${body.subject}\n\n${body.text}`,
    metadata: { to: emailRow.email, subject: body.subject },
    created_by: userData.user.id,
  })

  return Response.json({ success: true })
}

export const config: Config = {
  path: '/api/send-direct-email',
}
