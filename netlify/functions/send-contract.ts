import type { Config, Context } from '@netlify/functions'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { createFakeEmailProvider } from './_shared/emailProvider'
import { getEmailWebhookSecret, getDocumentTokenSecret } from './_shared/env'
import { signDocumentToken } from './_shared/documentToken'

/**
 * Staff-triggered send of a recruitment contract to a firm contact for
 * signature — creates the contract row (create_contract, status
 * 'draft'), sends the email, and only then marks it 'sent'
 * (mark_contract_sent) so a failed send never leaves a contract falsely
 * marked as delivered; retrying just calls this endpoint again. Same
 * "ordinary business contact, not a marketing send" reasoning as
 * send-direct-email.ts — no consent-ledger gating, but still checked
 * against the all_email suppression (hard bounce/complaint) that always
 * applies regardless of purpose.
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

  let body: { firmId?: string; contactPersonId?: string; feePercent?: number; guaranteeDays?: number }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.firmId || !body.contactPersonId) {
    return Response.json({ error: 'firmId and contactPersonId are required' }, { status: 400 })
  }

  const { data: contactLink } = await admin
    .from('firm_contacts')
    .select('person_id')
    .eq('firm_id', body.firmId)
    .eq('person_id', body.contactPersonId)
    .maybeSingle()
  if (!contactLink) {
    return Response.json({ error: 'This contact is not associated with this firm' }, { status: 400 })
  }

  const { data: contactRow } = await admin
    .from('people')
    .select('first_name, last_name, email_addresses(id, email, is_primary)')
    .eq('id', body.contactPersonId)
    .single()
  const emails = (contactRow?.email_addresses ?? []) as { id: string; email: string; is_primary: boolean }[]
  const primaryEmail = emails.find((e) => e.is_primary) ?? emails[0]
  if (!primaryEmail) {
    return Response.json({ error: 'This contact has no email address on file' }, { status: 404 })
  }

  const { data: suppression } = await admin
    .from('suppression_entries')
    .select('reason')
    .eq('email_address_id', primaryEmail.id)
    .eq('scope', 'all_email')
    .eq('active', true)
    .maybeSingle()
  if (suppression) {
    return Response.json(
      { error: `This address is suppressed (${suppression.reason}) and cannot be emailed.` },
      { status: 409 },
    )
  }

  const { data: template } = await admin
    .from('contract_templates')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!template) {
    return Response.json({ error: 'No contract template is set up yet' }, { status: 500 })
  }

  const { data: contract, error: createError } = await admin
    .rpc('create_contract', {
      p_firm_id: body.firmId,
      p_template_id: template.id,
      p_sent_to_person_id: body.contactPersonId,
      p_fee_percent: body.feePercent ?? null,
      p_guarantee_days: body.guaranteeDays ?? null,
    })
    .single()
  if (createError || !contract) {
    console.error('send-contract: create_contract failed', createError)
    return Response.json({ error: createError?.message ?? 'Could not create this contract' }, { status: 400 })
  }

  const contractRow = contract as { id: string }
  const siteUrl = process.env.URL ?? process.env.DEPLOY_PRIME_URL
  const signLink = `${siteUrl}/api/sign-contract?token=${signDocumentToken(contractRow.id, 'contract', getDocumentTokenSecret())}`
  const contactName = `${contactRow?.first_name ?? ''} ${contactRow?.last_name ?? ''}`.trim()

  const subject = 'Recruitment terms for signature — Yateworth Recruitment'
  const text = `Hi ${contactName},\n\nPlease review and sign our recruitment terms of business:\n${signLink}\n\nThanks,\nYateworth Recruitment`
  const htmlBody = `<p>Hi ${contactName},</p><p>Please review and sign our recruitment terms of business.</p><p><a href="${signLink}">Review &amp; sign</a></p><p>Thanks,<br>Yateworth Recruitment</p>`

  const provider = createFakeEmailProvider(getEmailWebhookSecret())
  let providerMessageId: string
  try {
    const result = await provider.send({ to: primaryEmail.email, subject, html: htmlBody, text })
    providerMessageId = result.providerMessageId
  } catch (err) {
    console.error('send-contract: provider send failed', err)
    return Response.json(
      { error: 'Could not send this contract — it has been saved as a draft, try sending again.' },
      { status: 502 },
    )
  }

  await admin.rpc('mark_contract_sent', { p_contract_id: contractRow.id })

  await admin.from('email_messages').insert({
    email_address_id: primaryEmail.id,
    purpose: 'recruitment',
    provider: provider.name,
    provider_message_id: providerMessageId,
    subject_snapshot: subject,
    status: 'sent',
    sent_at: new Date().toISOString(),
  })

  await admin.from('activities').insert({
    subject_type: 'firms',
    subject_id: body.firmId,
    activity_type: 'contract_sent',
    body: `Recruitment contract sent to ${contactName} for signature.`,
    metadata: { contract_id: contractRow.id, sent_to: primaryEmail.email },
    created_by: userData.user.id,
  })

  // Returned so the UI can show it directly — the fake provider never
  // puts this in a real inbox, so this is how staff preview it for now.
  return Response.json({ success: true, contractId: contractRow.id, signLink })
}

export const config: Config = {
  path: '/api/send-contract',
}
