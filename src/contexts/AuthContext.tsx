import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/types/database'

interface Profile {
  id: string
  fullName: string
  role: AppRole
  active: boolean
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, profile: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, loading: true })

  useEffect(() => {
    let cancelled = false

    async function loadProfile(session: Session | null) {
      if (!session) {
        if (!cancelled) setState({ session: null, profile: null, loading: false })
        return
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, active')
        .eq('id', session.user.id)
        .single()

      if (cancelled) return

      if (error || !data) {
        // A missing profile row means the account is not provisioned yet.
        // Treat it as unauthenticated rather than granting default access.
        setState({ session, profile: null, loading: false })
        return
      }

      setState({
        session,
        profile: {
          id: data.id,
          fullName: data.full_name,
          role: data.role,
          active: data.active,
        },
        loading: false,
      })
    }

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) =>
      loadProfile(data.session),
    )

    const { data: subscription } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setState((prev) => ({ ...prev, loading: true }))
      loadProfile(session)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
