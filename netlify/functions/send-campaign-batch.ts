import type { Config, Context } from '@netlify/functions'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { createFakeEmailProvider } from './_shared/emailProvider'
import { getEmailWebhookSecret } from './_shared/env'

/**
 * Claims a batch of pending recipients for a campaign, "sends" each one
 * through the fake email provider, and records the result. Uses the fake
 * provider (see _shared/emailProvider.ts) — no real EMAIL_PROVIDER_API_KEY
 * exists yet. Swapping in a real provider later only touches that one
 * file; this orchestration stays the same.
 *
 * Requires a Supabase session belonging to an active admin or marketing
 * user — this triggers real sends (once a real provider is wired in), so
 * it is not a public endpoint.
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

  if (profileError || !profile || !profile.active || !['admin', 'marketing'].includes(profile.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { campaignId?: string; batchSize?: number }
  try {
    body = (await req.json()) as { campaignId?: string; batchSize?: number }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.campaignId) {
    return Response.json({ error: 'campaignId is required' }, { status: 400 })
  }

  const { data: campaign, error: campaignError } = await admin
    .from('campaigns')
    .select('id, template_id')
    .eq('id', body.campaignId)
    .single()
  if (campaignError || !campaign) {
    return Response.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const { data: template, error: templateError } = await admin
    .from('email_templates')
    .select('subject_template, html_template, text_template')
    .eq('id', campaign.template_id)
    .single()
  if (templateError || !template) {
    return Response.json({ error: 'Template not found' }, { status: 404 })
  }

  const { data: claimed, error: claimError } = await admin.rpc('claim_campaign_batch', {
    p_campaign_id: body.campaignId,
    p_batch_size: body.batchSize ?? 50,
  })
  if (claimError) {
    return Response.json({ error: claimError.message }, { status: 500 })
  }

  const provider = createFakeEmailProvider(getEmailWebhookSecret())
  let sent = 0
  const failures: string[] = []

  for (const recipient of claimed ?? []) {
    try {
      const result = await provider.send({
        to: recipient.email_snapshot,
        subject: template.subject_template,
        html: template.html_template,
        text: template.text_template,
      })
      const { error: recordError } = await admin.rpc('record_email_sent', {
        p_campaign_recipient_id: recipient.id,
        p_provider: provider.name,
        p_provider_message_id: result.providerMessageId,
        p_subject_snapshot: template.subject_template,
      })
      if (recordError) throw recordError
      sent += 1
    } catch (err) {
      failures.push(recipient.id)
      console.error('send-campaign-batch: failed to send/record', recipient.id, err)
    }
  }

  return Response.json({ claimed: claimed?.length ?? 0, sent, failed: failures.length })
}

export const config: Config = {
  path: '/api/send-campaign-batch',
}
