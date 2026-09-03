import { supabase } from '@/lib/supabase'

/** Mints a fresh signed link for an already-sent contract or invoice, so staff can go back and preview it without re-sending. */
export async function fetchDocumentLink(type: 'contract' | 'invoice', id: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const response = await fetch('/api/document-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ type, id }),
  })
  const responseBody = (await response.json()) as { error?: string; link?: string }
  if (!response.ok || !responseBody.link) throw new Error(responseBody.error ?? 'Could not get this link')
  return responseBody.link
}
