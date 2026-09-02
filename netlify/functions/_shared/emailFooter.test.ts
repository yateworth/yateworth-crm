import { describe, expect, it } from 'vitest'
import { appendUnsubscribeFooter, unsubscribeScopeForPurpose } from './emailFooter'

describe('unsubscribeScopeForPurpose', () => {
  it('maps blog to the blog scope', () => {
    expect(unsubscribeScopeForPurpose('blog')).toBe('blog')
  })

  it('maps recruitment to the recruitment scope', () => {
    expect(unsubscribeScopeForPurpose('recruitment')).toBe('recruitment')
  })

  it('maps report to the broader all_marketing scope', () => {
    expect(unsubscribeScopeForPurpose('report')).toBe('all_marketing')
  })
})

describe('appendUnsubscribeFooter', () => {
  it('appends an unsubscribe link to both html and text bodies', () => {
    const result = appendUnsubscribeFooter('<p>Hi</p>', 'Hi', 'https://example.com/api/unsubscribe?token=abc&scope=blog')
    expect(result.html).toContain('<p>Hi</p>')
    expect(result.html).toContain('https://example.com/api/unsubscribe?token=abc&scope=blog')
    expect(result.text).toContain('Hi')
    expect(result.text).toContain('https://example.com/api/unsubscribe?token=abc&scope=blog')
  })

  it('does not mutate the original template strings', () => {
    const html = '<p>Original</p>'
    const text = 'Original'
    appendUnsubscribeFooter(html, text, 'https://example.com/unsub')
    expect(html).toBe('<p>Original</p>')
    expect(text).toBe('Original')
  })
})
