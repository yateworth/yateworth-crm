import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 pb-1 text-sm font-medium transition-colors ${
    isActive ? 'border-brass text-ground' : 'border-transparent text-ground/70 hover:text-ground'
  }`

export function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-ground">
      <header className="sticky top-0 z-40 bg-ink text-ground">
        <div className="mx-auto flex max-w-5xl items-center gap-8 px-6" style={{ minHeight: 72 }}>
          <span className="font-display text-xl font-bold tracking-tight">
            Yateworth<span className="text-brass">.</span>
          </span>
          <nav className="flex items-center gap-6">
            <NavLink to="/" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/candidates" className={navLinkClass}>
              Candidates
            </NavLink>
            <NavLink to="/firms" className={navLinkClass}>
              Firms
            </NavLink>
            <NavLink to="/jobs" className={navLinkClass}>
              Jobs
            </NavLink>
            <NavLink to="/surveys" className={navLinkClass}>
              Surveys
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-ground/70">
              {profile?.fullName} <span className="text-ground/50">({profile?.role})</span>
            </span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-sm text-ground/70 hover:text-brass"
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
