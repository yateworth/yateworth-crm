import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { CandidatesPage } from '@/pages/Candidates'
import { CandidateDetailPage } from '@/pages/CandidateDetail'
import { FirmsPage } from '@/pages/Firms'
import { FirmDetailPage } from '@/pages/FirmDetail'
import { JobsPage } from '@/pages/Jobs'
import { JobDetailPage } from '@/pages/JobDetail'
import { SurveysPage } from '@/pages/Surveys'
import { SurveyDetailPage } from '@/pages/SurveyDetail'
import { MailingListsPage } from '@/pages/marketing/MailingLists'
import { EmailTemplatesPage } from '@/pages/marketing/EmailTemplates'
import { CampaignsPage } from '@/pages/marketing/Campaigns'
import { CampaignDetailPage } from '@/pages/marketing/CampaignDetail'
import { ComposePage } from '@/pages/marketing/Compose'
import { PlacementsPage } from '@/pages/Placements'

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
          <Route
            path="/jobs"
            element={
              <ProtectedRoute>
                <JobsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs/:id"
            element={
              <ProtectedRoute>
                <JobDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/surveys"
            element={
              <ProtectedRoute>
                <SurveysPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/surveys/:slug"
            element={
              <ProtectedRoute>
                <SurveyDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/placements"
            element={
              <ProtectedRoute>
                <PlacementsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/marketing/compose"
            element={
              <ProtectedRoute>
                <ComposePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/marketing/campaigns"
            element={
              <ProtectedRoute>
                <CampaignsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/marketing/campaigns/:id"
            element={
              <ProtectedRoute>
                <CampaignDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/marketing/lists"
            element={
              <ProtectedRoute>
                <MailingListsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/marketing/templates"
            element={
              <ProtectedRoute>
                <EmailTemplatesPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
