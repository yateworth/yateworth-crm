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
 * Fake provider for Milestone 4 — no real EMAIL_PROVIDER_API_KEY exists
 * yet. Logs what it would have sent and returns a fake but unique
 * message id, so the rest of the pipeline (claiming, recording
 * email_messages, status transitions) can be built and tested end to
 * end before a real Resend/Postmark account exists. Swap for a real
 * adapter behind the same interface in a later milestone — nothing that
 * calls EmailProvider should need to change.
 */
export function createFakeEmailProvider(): EmailProvider {
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
    async verifyWebhook() {
      return []
    },
    async suppress(email, reason) {
      console.log('[fake email provider] would register suppression', { email, reason })
    },
  }
}
