import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { AppRole } from '@/types/database'

interface Props {
  children: ReactNode
  allowedRoles?: AppRole[]
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Loading…
      </div>
    )
  }

  if (!session || !profile || !profile.active) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        You don't have access to this page.
      </div>
    )
  }

  return <>{children}</>
}
