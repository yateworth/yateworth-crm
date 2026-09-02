import type { Database } from '../../../src/types/database'

type PermissionPurpose = Database['public']['Enums']['permission_purpose']
type UnsubscribeScope = 'blog' | 'recruitment' | 'all_marketing'

/**
 * The public unsubscribe endpoint only accepts blog/recruitment/
 * all_marketing (see netlify/functions/unsubscribe.ts) — 'report' isn't
 * an ongoing send a person can unsubscribe from one purpose at a time,
 * so a report campaign's footer links use the broadest scope instead.
 */
export function unsubscribeScopeForPurpose(purpose: PermissionPurpose): UnsubscribeScope {
  if (purpose === 'blog') return 'blog'
  if (purpose === 'recruitment') return 'recruitment'
  return 'all_marketing'
}

/**
 * Appended server-side to every campaign send, regardless of what the
 * template author wrote — an unsubscribe link should never depend on
 * someone remembering to paste a merge tag into a template.
 */
export function appendUnsubscribeFooter(
  html: string,
  text: string,
  unsubscribeUrl: string,
): { html: string; text: string } {
  const htmlFooter = `<hr style="margin-top:32px;border:none;border-top:1px solid #ddd" /><p style="font-size:12px;color:#666;margin-top:12px">You're receiving this email from Yateworth. <a href="${unsubscribeUrl}">Unsubscribe</a></p>`
  const textFooter = `\n\n---\nYou're receiving this email from Yateworth.\nUnsubscribe: ${unsubscribeUrl}`
  return { html: html + htmlFooter, text: text + textFooter }
}
