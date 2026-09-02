import { describe, expect, it } from 'vitest'
import { extractEmailAddress, parseAddressList, matchMessageToPeople } from './gmailMatching'

describe('extractEmailAddress', () => {
  it('extracts the address from a "Name <email>" header', () => {
    expect(extractEmailAddress('Jane Smith <jane@example.com>')).toBe('jane@example.com')
  })

  it('lowercases and trims', () => {
    expect(extractEmailAddress('  Jane@EXAMPLE.com  ')).toBe('jane@example.com')
  })

  it('handles a bare address with no display name', () => {
    expect(extractEmailAddress('jane@example.com')).toBe('jane@example.com')
  })
})

describe('parseAddressList', () => {
  it('splits a comma-separated header into individual addresses', () => {
    expect(parseAddressList('Jane <jane@example.com>, Bob <bob@example.com>')).toEqual([
      'jane@example.com',
      'bob@example.com',
    ])
  })

  it('returns an empty array for an undefined header', () => {
    expect(parseAddressList(undefined)).toEqual([])
  })

  it('returns an empty array for an empty header', () => {
    expect(parseAddressList('')).toEqual([])
  })
})

describe('matchMessageToPeople', () => {
  const emailToPersonId = new Map([
    ['candidate@example.com', 'person-1'],
    ['contact@example.com', 'person-2'],
  ])

  it('matches a known sender', () => {
    const result = matchMessageToPeople(
      { from: 'candidate@example.com', to: ['lauren@yateworth.com.au'], cc: [] },
      emailToPersonId,
      'lauren@yateworth.com.au',
    )
    expect(result).toEqual(['person-1'])
  })

  it('matches multiple known participants without duplicates', () => {
    const result = matchMessageToPeople(
      {
        from: 'lauren@yateworth.com.au',
        to: ['candidate@example.com'],
        cc: ['contact@example.com', 'candidate@example.com'],
      },
      emailToPersonId,
      'lauren@yateworth.com.au',
    )
    expect(result.sort()).toEqual(['person-1', 'person-2'])
  })

  it('excludes the connected mailbox itself even if it happens to be a known address', () => {
    const selfIncluded = new Map(emailToPersonId).set('lauren@yateworth.com.au', 'person-self')
    const result = matchMessageToPeople(
      { from: 'lauren@yateworth.com.au', to: ['candidate@example.com'], cc: [] },
      selfIncluded,
      'lauren@yateworth.com.au',
    )
    expect(result).toEqual(['person-1'])
  })

  it('returns an empty array when no participant is known', () => {
    const result = matchMessageToPeople(
      { from: 'stranger@example.com', to: ['lauren@yateworth.com.au'], cc: [] },
      emailToPersonId,
      'lauren@yateworth.com.au',
    )
    expect(result).toEqual([])
  })

  it('is case-insensitive when matching against the lookup', () => {
    const result = matchMessageToPeople(
      { from: 'Candidate@EXAMPLE.com', to: [], cc: [] },
      emailToPersonId,
      'lauren@yateworth.com.au',
    )
    expect(result).toEqual(['person-1'])
  })
})
