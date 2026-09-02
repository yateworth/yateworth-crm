import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { CandidatesPage } from '@/pages/Candidates'
import { CandidateDetailPage } from '@/pages/CandidateDetail'
import { FirmsPage } from '@/pages/Firms'
import { FirmDetailPage } from '@/pages/FirmDetail'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/candidates"
            element={
              <ProtectedRoute>
                <CandidatesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/candidates/:id"
            element={
              <ProtectedRoute>
                <CandidateDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/firms"
            element={
              <ProtectedRoute>
                <FirmsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/firms/:id"
            element={
              <ProtectedRoute>
                <FirmDetailPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
