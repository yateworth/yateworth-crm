import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export function LoginPage() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) setError(error.message)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-lg border border-ink/10 bg-paper p-8 shadow-sm"
      >
        <div>
          <span className="font-display text-lg font-bold text-ink">
            Yateworth<span className="text-ox">.</span>
          </span>
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink">Sign in</h1>
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium text-sec">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm focus:border-ox focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium text-sec">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm focus:border-ox focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-ox">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md border-2 border-ox bg-ox px-3 py-2 text-sm font-semibold text-[#fffcfa] transition-colors hover:border-ox-lift hover:bg-ox-lift disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
