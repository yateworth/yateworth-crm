import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Signed, tamper-resistant links for the contract-signing and
 * invoice-viewing pages — same shape as unsubscribeToken.ts (base64url
 * payload + '.' + base64url hmac-sha256 signature), but under its own
 * DOCUMENT_TOKEN_SECRET rather than reusing UNSUBSCRIBE_TOKEN_SECRET:
 * different blast radius (a contract-signing link vs. an unsubscribe
 * link) if either secret ever leaked, so they're kept independent.
 *
 * docType is embedded in and checked against the payload so a contract
 * token can never be replayed against the invoice endpoint or vice
 * versa, even though both are verified with the same secret.
 */

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000

export type DocumentTokenType = 'contract' | 'invoice'

interface TokenPayload {
  docId: string
  docType: DocumentTokenType
  exp: number
}

function base64url(input: Buffer): string {
  return input.toString('base64url')
}

function sign(payload: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(payload).digest())
}

export function signDocumentToken(
  docId: string,
  docType: DocumentTokenType,
  secret: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const payload: TokenPayload = { docId, docType, exp: Date.now() + ttlMs }
  const payloadEncoded = base64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = sign(payloadEncoded, secret)
  return `${payloadEncoded}.${signature}`
}

export function verifyDocumentToken(token: string, docType: DocumentTokenType, secret: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadEncoded, signature] = parts

  const expectedSignature = sign(payloadEncoded, secret)
  const a = Buffer.from(signature)
  const b = Buffer.from(expectedSignature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload.docId !== 'string' || typeof payload.exp !== 'number' || payload.docType !== docType) {
    return null
  }
  if (Date.now() > payload.exp) return null

  return payload.docId
}
