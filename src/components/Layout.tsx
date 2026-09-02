import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium ${isActive ? 'text-neutral-900' : 'text-neutral-500 hover:text-neutral-900'}`

export function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 p-4">
          <span className="text-lg font-semibold text-neutral-900">Yateworth CRM</span>
          <nav className="flex items-center gap-5">
            <NavLink to="/" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/candidates" className={navLinkClass}>
              Candidates
            </NavLink>
            <NavLink to="/firms" className={navLinkClass}>
              Firms
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-neutral-600">
              {profile?.fullName} ({profile?.role})
            </span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-sm text-neutral-500 hover:text-neutral-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-8">{children}</main>
    </div>
  )
}
