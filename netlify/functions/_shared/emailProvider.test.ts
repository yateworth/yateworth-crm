import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createFakeEmailProvider } from './emailProvider'

const SECRET = 'test-webhook-secret'

function signedRequest(body: string, secret: string) {
  const signature = createHmac('sha256', secret).update(body).digest('hex')
  return new Request('https://example.test/api/email-webhook', {
    method: 'POST',
    headers: { 'x-webhook-signature': signature },
    body,
  })
}

const SAMPLE_EVENTS = JSON.stringify([
  {
    provider_event_id: 'evt-1',
    event_type: 'hard_bounce',
    provider_message_id: 'msg-1',
    occurred_at: '2026-01-01T00:00:00.000Z',
    payload: { reason: 'mailbox does not exist' },
  },
])

describe('fake email provider webhook verification', () => {
  it('accepts a correctly-signed payload and parses events', async () => {
    const provider = createFakeEmailProvider(SECRET)
    const events = await provider.verifyWebhook(signedRequest(SAMPLE_EVENTS, SECRET))
    expect(events).toEqual([
      {
        providerEventId: 'evt-1',
        eventType: 'hard_bounce',
        providerMessageId: 'msg-1',
        occurredAt: '2026-01-01T00:00:00.000Z',
        payload: { reason: 'mailbox does not exist' },
      },
    ])
  })

  it('rejects a payload signed with the wrong secret', async () => {
    const provider = createFakeEmailProvider(SECRET)
    await expect(
      provider.verifyWebhook(signedRequest(SAMPLE_EVENTS, 'wrong-secret')),
    ).rejects.toThrow('invalid webhook signature')
  })

  it('rejects a tampered body even with a signature present', async () => {
    const provider = createFakeEmailProvider(SECRET)
    const validRequest = signedRequest(SAMPLE_EVENTS, SECRET)
    const tamperedBody = SAMPLE_EVENTS.replace('hard_bounce', 'delivered')
    const tampered = new Request(validRequest.url, {
      method: 'POST',
      headers: validRequest.headers,
      body: tamperedBody,
    })
    await expect(provider.verifyWebhook(tampered)).rejects.toThrow('invalid webhook signature')
  })

  it('rejects a missing signature header', async () => {
    const provider = createFakeEmailProvider(SECRET)
    const request = new Request('https://example.test/api/email-webhook', {
      method: 'POST',
      body: SAMPLE_EVENTS,
    })
    await expect(provider.verifyWebhook(request)).rejects.toThrow('invalid webhook signature')
  })
})
