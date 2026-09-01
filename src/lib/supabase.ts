import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getClientEnv } from '@/lib/env'

const env = getClientEnv()

/**
 * Browser Supabase client. Uses only the anonymous/public key — this file
 * must never import or reference a service-role key. Privileged operations
 * (Apollo, email provider, bulk exports) run in netlify/functions instead.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
