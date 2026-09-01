import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('getClientEnv', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns the configured values when all variables are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubEnv('VITE_APP_BASE_URL', 'https://crm.example.com')

    const { getClientEnv } = await import('./env')
    expect(getClientEnv()).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key',
      appBaseUrl: 'https://crm.example.com',
    })
  })

  it('throws a descriptive error when a required variable is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubEnv('VITE_APP_BASE_URL', 'https://crm.example.com')

    const { getClientEnv } = await import('./env')
    expect(() => getClientEnv()).toThrow('VITE_SUPABASE_URL')
  })
})
