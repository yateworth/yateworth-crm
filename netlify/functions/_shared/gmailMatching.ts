/**
 * Pure matching logic for Gmail sync, kept separate from the actual
 * Gmail API calls and Supabase queries so it's unit-testable without a
 * real inbox or database (see gmailMatching.test.ts). Given a parsed
 * message's participant addresses and a lookup of known
 * email_addresses -> person_id, returns the person_id(s) this message
 * should be logged against.
 */

export interface ParsedMessageAddresses {
  from: string
  to: string[]
  cc: string[]
}

/** Extracts a bare email address from a "Name <email@domain>" style header value. */
export function extractEmailAddress(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/)
  const raw = match ? match[1] : headerValue
  return raw.trim().toLowerCase()
}

export function parseAddressList(headerValue: string | undefined): string[] {
  if (!headerValue) return []
  return headerValue
    .split(',')
    .map((part) => extractEmailAddress(part))
    .filter(Boolean)
}

/**
 * Returns the distinct set of known person_ids this message involves,
 * excluding the connected mailbox's own address (so an email from
 * yourself to yourself, or where you're just cc'd alongside the real
 * participants, doesn't log against your own contact record if you
 * happen to have one).
 */
export function matchMessageToPeople(
  addresses: ParsedMessageAddresses,
  emailToPersonId: Map<string, string>,
  ownEmail: string,
): string[] {
  const own = ownEmail.toLowerCase()
  const allAddresses = [addresses.from, ...addresses.to, ...addresses.cc]
    .map((a) => a.toLowerCase())
    .filter((a) => a && a !== own)

  const matched = new Set<string>()
  for (const address of allAddresses) {
    const personId = emailToPersonId.get(address)
    if (personId) matched.add(personId)
  }
  return [...matched]
}
