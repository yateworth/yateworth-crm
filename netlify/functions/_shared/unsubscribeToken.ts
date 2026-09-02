import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Signed, tamper-resistant unsubscribe tokens. Format: base64url(payload)
 * + '.' + base64url(hmac-sha256(payload, secret)). No signature can be
 * forged without UNSUBSCRIBE_TOKEN_SECRET (a Netlify env var, never
 * committed, never sent to the browser).
 *
 * Verification never distinguishes "expired" from "tampered" from
 * "malformed" in its return value or timing-sensitive path — all three
 * just return null — so a failed attempt can't be used to probe for a
 * valid emailAddressId. The spec requires the unsubscribe link to keep
 * working for at least 30 days after a message is sent; DEFAULT_TTL_MS
 * here is 90 days, comfortably past that floor.
 */

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000

interface TokenPayload {
  emailAddressId: string
  exp: number
}

function base64url(input: Buffer): string {
  return input.toString('base64url')
}

function sign(payload: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(payload).digest())
}

export function signUnsubscribeToken(
  emailAddressId: string,
  secret: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const payload: TokenPayload = { emailAddressId, exp: Date.now() + ttlMs }
  const payloadEncoded = base64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = sign(payloadEncoded, secret)
  return `${payloadEncoded}.${signature}`
}

export function verifyUnsubscribeToken(token: string, secret: string): string | null {
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
  if (typeof payload.emailAddressId !== 'string' || typeof payload.exp !== 'number') return null
  if (Date.now() > payload.exp) return null

  return payload.emailAddressId
}
