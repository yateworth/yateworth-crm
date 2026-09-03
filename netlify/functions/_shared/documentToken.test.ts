import { describe, expect, it } from 'vitest'
import { signDocumentToken, verifyDocumentToken } from './documentToken'

const SECRET = 'test-secret-do-not-use-in-real-env'
const DOC_ID = '11111111-1111-1111-1111-111111111111'

describe('document token', () => {
  it('round-trips a valid token back to the same docId', () => {
    const token = signDocumentToken(DOC_ID, 'contract', SECRET)
    expect(verifyDocumentToken(token, 'contract', SECRET)).toBe(DOC_ID)
  })

  it('rejects a token used against the wrong docType, even with the right secret', () => {
    const token = signDocumentToken(DOC_ID, 'contract', SECRET)
    expect(verifyDocumentToken(token, 'invoice', SECRET)).toBeNull()
  })

  it('rejects a token signed with a different secret', () => {
    const token = signDocumentToken(DOC_ID, 'contract', 'wrong-secret')
    expect(verifyDocumentToken(token, 'contract', SECRET)).toBeNull()
  })

  it('rejects a tampered payload even if the signature format still parses', () => {
    const token = signDocumentToken(DOC_ID, 'contract', SECRET)
    const [, signature] = token.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ docId: '22222222-2222-2222-2222-222222222222', docType: 'contract', exp: Date.now() + 1000000 }),
      'utf8',
    ).toString('base64url')
    expect(verifyDocumentToken(`${forgedPayload}.${signature}`, 'contract', SECRET)).toBeNull()
  })

  it('rejects an expired token', () => {
    const token = signDocumentToken(DOC_ID, 'invoice', SECRET, -1000)
    expect(verifyDocumentToken(token, 'invoice', SECRET)).toBeNull()
  })

  it('rejects malformed tokens without throwing', () => {
    expect(verifyDocumentToken('not-a-token', 'contract', SECRET)).toBeNull()
    expect(verifyDocumentToken('', 'invoice', SECRET)).toBeNull()
    expect(verifyDocumentToken('a.b.c', 'contract', SECRET)).toBeNull()
  })

  it('never returns a value derived from an invalid token (no partial/garbage docId leaks)', () => {
    const token = signDocumentToken(DOC_ID, 'invoice', SECRET)
    const [payloadEncoded] = token.split('.')
    expect(verifyDocumentToken(`${payloadEncoded}.garbage`, 'invoice', SECRET)).toBeNull()
  })
})
