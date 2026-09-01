import { createClient } from '@supabase/supabase-js'
import { getServerEnv } from './env'

/**
 * Service-role Supabase client. Bypasses Row Level Security entirely —
 * every query issued through this client must apply its own authorisation
 * logic (role checks, ownership checks) in code. Only import this from
 * netlify/functions, never from src/.
 */
export function getSupabaseAdmin() {
  const env = getServerEnv()
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  })
}
