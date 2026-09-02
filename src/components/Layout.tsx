import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
    isActive ? 'bg-brass text-ink' : 'text-ground/75 hover:bg-ground/10 hover:text-ground'
  }`

export function Layout({ children }: { children: ReactNode }) {
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-ground">
      <header className="sticky top-0 z-40 bg-ink text-ground shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <span className="font-display text-xl font-bold tracking-tight">
            Yateworth<span className="text-brass">.</span>
          </span>
          <nav className="flex flex-wrap items-center gap-1">
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
            <NavLink to="/placements" className={navLinkClass}>
              Placements
            </NavLink>
            <NavLink to="/surveys" className={navLinkClass}>
              Surveys
            </NavLink>
            <NavLink to="/marketing/compose" className={navLinkClass}>
              Marketing
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-ground/70">
              {profile?.fullName} <span className="text-ground/50">({profile?.role})</span>
            </span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-ground/75 transition-colors hover:bg-ground/10 hover:text-ground"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-8">{children}</main>
    </div>
  )
}
