/**
 * Client-side environment variable validation.
 *
 * Only VITE_-prefixed variables are ever available in the browser bundle.
 * Anything else (service role key, Apollo key, email provider key) must
 * stay server-side in Netlify Functions and is validated separately in
 * netlify/functions/_shared/env.ts.
 */

interface ClientEnv {
  supabaseUrl: string
  supabaseAnonKey: string
  appBaseUrl: string
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`,
    )
  }
  return value
}

let cached: ClientEnv | undefined

export function getClientEnv(): ClientEnv {
  if (cached) return cached
  cached = {
    supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
    supabaseAnonKey: required(
      'VITE_SUPABASE_ANON_KEY',
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    ),
    appBaseUrl: required('VITE_APP_BASE_URL', import.meta.env.VITE_APP_BASE_URL),
  }
  return cached
}
