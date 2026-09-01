/**
 * Server-side environment variable access for Netlify Functions.
 *
 * This module is the ONLY place that should read SUPABASE_SERVICE_ROLE_KEY,
 * APOLLO_API_KEY or EMAIL_PROVIDER_API_KEY. Never import this file, or
 * re-export its values, from anything under src/ (the browser bundle) —
 * doing so would ship a secret to every visitor.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getServerEnv() {
  return {
    supabaseUrl: required('VITE_SUPABASE_URL'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    cronSecret: required('CRON_SECRET'),
  }
}

/** Lazily validated — only functions that actually call Apollo need this. */
export function getApolloEnv() {
  return { apolloApiKey: required('APOLLO_API_KEY') }
}

/** Lazily validated — only functions that actually send email need this. */
export function getEmailProviderEnv() {
  return {
    provider: required('EMAIL_PROVIDER'),
    apiKey: required('EMAIL_PROVIDER_API_KEY'),
    webhookSecret: required('EMAIL_WEBHOOK_SECRET'),
  }
}
