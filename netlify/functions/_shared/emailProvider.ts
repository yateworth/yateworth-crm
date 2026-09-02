export interface OutboundMessage {
  to: string
  subject: string
  html: string
  text: string
}

export interface ProviderSendResult {
  providerMessageId: string
}

export interface VerifiedProviderEvent {
  providerEventId: string
  eventType: string
  providerMessageId: string
  occurredAt: string
  payload: Record<string, unknown>
}

export interface EmailProvider {
  name: string
  send(message: OutboundMessage): Promise<ProviderSendResult>
  verifyWebhook(request: Request): Promise<VerifiedProviderEvent[]>
  suppress(email: string, reason: string): Promise<void>
}

/**
 * Fake provider for Milestone 4/5 — no real EMAIL_PROVIDER_API_KEY or
 * real provider webhook exists yet. `send` logs what it would have sent
 * and returns a fake but unique message id, so the rest of the pipeline
 * (claiming, recording email_messages, status transitions) can be built
 * and tested end to end before a real Resend/Postmark account exists.
 *
 * `verifyWebhook` is NOT a stub, though — real signature verification
 * matters enough (per the spec: "webhooks must verify the provider
 * signature") that it's worth testing now against a made-up but genuine
 * HMAC-SHA256 scheme, using EMAIL_WEBHOOK_SECRET: the body is a JSON
 * array of events, signed as hex HMAC-SHA256 of the raw body in an
 * `x-webhook-signature` header. Swapping in a real provider later means
 * replacing this file's signature scheme with the real vendor's (Resend/
 * Postmark each have their own) — nothing that calls EmailProvider
 * elsewhere should need to change.
 */
export function createFakeEmailProvider(webhookSecret: string): EmailProvider {
  return {
    name: 'fake',
    async send(message) {
      const providerMessageId = `fake_${Date.now()}_${Math.random().toString(36).slice(2)}`
      console.log('[fake email provider] would send', {
        to: message.to,
        subject: message.subject,
        providerMessageId,
      })
      return { providerMessageId }
    },
    async verifyWebhook(request) {
      const { createHmac, timingSafeEqual } = await import('node:crypto')
      const signature = request.headers.get('x-webhook-signature') ?? ''
      const rawBody = await request.text()

      const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex')
      const a = Buffer.from(signature, 'hex')
      const b = Buffer.from(expected, 'hex')
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new Error('invalid webhook signature')
      }

      const events = JSON.parse(rawBody) as Array<{
        provider_event_id: string
        event_type: string
        provider_message_id: string
        occurred_at: string
        payload?: Record<string, unknown>
      }>

      return events.map((e) => ({
        providerEventId: e.provider_event_id,
        eventType: e.event_type,
        providerMessageId: e.provider_message_id,
        occurredAt: e.occurred_at,
        payload: e.payload ?? {},
      }))
    },
    async suppress(email, reason) {
      console.log('[fake email provider] would register suppression', { email, reason })
    },
  }
}
