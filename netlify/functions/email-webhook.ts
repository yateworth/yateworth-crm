import type { Config, Context } from '@netlify/functions'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { getEmailWebhookSecret } from './_shared/env'
import { createFakeEmailProvider } from './_shared/emailProvider'

/**
 * Receives provider events (bounce, complaint, delivered, open, click).
 * Signature-verified (see _shared/emailProvider.ts's fake HMAC scheme —
 * swap for the real provider's verification when one exists) and
 * idempotent: process_email_event() no-ops on a provider_event_id it has
 * already seen, so a retried webhook delivery has no duplicate effect.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  const provider = createFakeEmailProvider(getEmailWebhookSecret())

  let events
  try {
    events = await provider.verifyWebhook(req)
  } catch (err) {
    console.error('email-webhook: signature verification failed', err)
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()

  for (const event of events) {
    const { error } = await admin.rpc('process_email_event', {
      p_provider: provider.name,
      p_provider_event_id: event.providerEventId,
      p_event_type: event.eventType,
      p_provider_message_id: event.providerMessageId,
      p_payload: event.payload,
      p_occurred_at: event.occurredAt,
    })
    if (error) {
      console.error('email-webhook: process_email_event failed', event.providerEventId, error)
    }
  }

  return Response.json({ processed: events.length })
}

export const config: Config = {
  path: '/api/email-webhook',
}
