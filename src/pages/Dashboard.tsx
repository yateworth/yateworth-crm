import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export function DashboardPage() {
  const { profile } = useAuth()

  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">Yateworth CRM</h1>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            Sign out
          </button>
        </div>
        <p className="text-sm text-neutral-600">
          Signed in as {profile?.fullName} ({profile?.role}).
        </p>
        <p className="text-sm text-neutral-500">
          Phase 0 foundation only — recruitment, survey and campaign screens land in later
          milestones.
        </p>
      </div>
    </div>
  )
}
