import { describe, expect, it } from 'vitest'
import { signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribeToken'

const SECRET = 'test-secret-do-not-use-in-real-env'
const EMAIL_ADDRESS_ID = '11111111-1111-1111-1111-111111111111'

describe('unsubscribe token', () => {
  it('round-trips a valid token back to the same emailAddressId', () => {
    const token = signUnsubscribeToken(EMAIL_ADDRESS_ID, SECRET)
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(EMAIL_ADDRESS_ID)
  })

  it('rejects a token signed with a different secret', () => {
    const token = signUnsubscribeToken(EMAIL_ADDRESS_ID, 'wrong-secret')
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull()
  })

  it('rejects a tampered payload even if the signature format still parses', () => {
    const token = signUnsubscribeToken(EMAIL_ADDRESS_ID, SECRET)
    const [, signature] = token.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ emailAddressId: '22222222-2222-2222-2222-222222222222', exp: Date.now() + 1000000 }),
      'utf8',
    ).toString('base64url')
    expect(verifyUnsubscribeToken(`${forgedPayload}.${signature}`, SECRET)).toBeNull()
  })

  it('rejects an expired token', () => {
    const token = signUnsubscribeToken(EMAIL_ADDRESS_ID, SECRET, -1000)
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull()
  })

  it('rejects malformed tokens without throwing', () => {
    expect(verifyUnsubscribeToken('not-a-token', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('a.b.c', SECRET)).toBeNull()
  })

  it('never returns a value derived from an invalid token (no partial/garbage emailAddressId leaks)', () => {
    const token = signUnsubscribeToken(EMAIL_ADDRESS_ID, SECRET)
    const [payloadEncoded] = token.split('.')
    // valid payload, garbage signature - must fail closed, not return
    // the real emailAddressId just because the payload itself is intact
    expect(verifyUnsubscribeToken(`${payloadEncoded}.garbage`, SECRET)).toBeNull()
  })
})
