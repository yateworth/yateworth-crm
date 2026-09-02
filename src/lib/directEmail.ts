import { supabase } from '@/lib/supabase'

/** A one-off email straight to a person (candidate or firm contact) — see netlify/functions/send-direct-email.ts. */
export async function sendDirectEmail(personId: string, subject: string, text: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const response = await fetch('/api/send-direct-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ personId, subject, text }),
  })
  const body = (await response.json()) as { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Could not send this email')
}
