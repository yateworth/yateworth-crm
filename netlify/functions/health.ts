import type { Config, Context } from '@netlify/functions'
import { getServerEnv } from './_shared/env'

/**
 * Confirms the server-side environment is configured without exposing any
 * secret value — useful for verifying a Netlify deploy's env vars before
 * wiring up anything that actually touches Supabase, Apollo or email.
 */
export default async (_req: Request, _context: Context) => {
  try {
    getServerEnv()
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export const config: Config = {
  path: '/api/health',
}
