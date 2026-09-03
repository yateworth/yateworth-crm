import type { Config, Context } from '@netlify/functions'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { createFakeEmailProvider } from './_shared/emailProvider'
import { getEmailWebhookSecret, getDocumentTokenSecret } from './_shared/env'
import { signDocumentToken } from './_shared/documentToken'

/**
 * Staff-triggered send of a placement's invoice to a firm contact — same
 * create-then-send-then-mark-sent shape as send-contract.ts, so a failed
 * send never leaves an invoice falsely marked as delivered.
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

  let body: { placementId?: string; contactPersonId?: string; dueDays?: number }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.placementId || !body.contactPersonId) {
    return Response.json({ error: 'placementId and contactPersonId are required' }, { status: 400 })
  }

  const { data: placementInfo } = await admin
    .from('placements')
    .select('submissions!inner(jobs!inner(id, title, firm_id, firms(name)))')
    .eq('id', body.placementId)
    .maybeSingle()
  const jobInfo = (
    placementInfo as unknown as {
      submissions: { jobs: { id: string; title: string; firm_id: string; firms: { name: string } | null } }
    } | null
  )?.submissions?.jobs
  if (!jobInfo) {
    return Response.json({ error: 'Placement not found' }, { status: 404 })
  }

  const { data: contactLink } = await admin
    .from('firm_contacts')
    .select('person_id')
    .eq('firm_id', jobInfo.firm_id)
    .eq('person_id', body.contactPersonId)
    .maybeSingle()
  if (!contactLink) {
    return Response.json({ error: 'This contact is not associated with this job’s firm' }, { status: 400 })
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

  const { data: invoice, error: createError } = await admin
    .rpc('create_invoice', {
      p_placement_id: body.placementId,
      p_sent_to_person_id: body.contactPersonId,
      p_due_days: body.dueDays ?? 14,
    })
    .single()
  if (createError || !invoice) {
    console.error('send-invoice: create_invoice failed', createError)
    return Response.json({ error: createError?.message ?? 'Could not create this invoice' }, { status: 400 })
  }

  const invoiceRow = invoice as { id: string; invoice_number: string; total_amount: number }
  const siteUrl = process.env.URL ?? process.env.DEPLOY_PRIME_URL
  const viewLink = `${siteUrl}/api/view-invoice?token=${signDocumentToken(invoiceRow.id, 'invoice', getDocumentTokenSecret())}`
  const contactName = `${contactRow?.first_name ?? ''} ${contactRow?.last_name ?? ''}`.trim()
  const firmName = jobInfo.firms?.name ?? 'your firm'

  const subject = `Invoice ${invoiceRow.invoice_number} — ${jobInfo.title} placement`
  const text = `Hi ${contactName},\n\nPlease find invoice ${invoiceRow.invoice_number} for the ${jobInfo.title} placement:\n${viewLink}\n\nTotal due: $${invoiceRow.total_amount.toLocaleString()}\n\nThanks,\nYateworth Recruitment`
  const htmlBody = `<p>Hi ${contactName},</p><p>Please find invoice ${invoiceRow.invoice_number} for the ${jobInfo.title} placement at ${firmName}.</p><p><a href="${viewLink}">View invoice</a> — total due $${invoiceRow.total_amount.toLocaleString()}</p><p>Thanks,<br>Yateworth Recruitment</p>`

  const provider = createFakeEmailProvider(getEmailWebhookSecret())
  let providerMessageId: string
  try {
    const result = await provider.send({ to: primaryEmail.email, subject, html: htmlBody, text })
    providerMessageId = result.providerMessageId
  } catch (err) {
    console.error('send-invoice: provider send failed', err)
    return Response.json(
      { error: 'Could not send this invoice — it has been saved, try sending again.' },
      { status: 502 },
    )
  }

  await admin.rpc('mark_invoice_sent', { p_invoice_id: invoiceRow.id })

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
    subject_type: 'jobs',
    subject_id: jobInfo.id,
    activity_type: 'invoice_sent',
    body: `Invoice ${invoiceRow.invoice_number} sent to ${contactName}.`,
    metadata: { invoice_id: invoiceRow.id, sent_to: primaryEmail.email },
    created_by: userData.user.id,
  })

  // Returned so the UI can show it directly — the fake provider never
  // puts this in a real inbox, so this is how staff preview it for now.
  return Response.json({ success: true, invoiceId: invoiceRow.id, viewLink })
}

export const config: Config = {
  path: '/api/send-invoice',
}
