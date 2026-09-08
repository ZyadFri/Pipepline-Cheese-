import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'

// Public / auth pages
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'

// Top-level layout (Dashboard)
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ProfilePage from './pages/ProfilePage'

// Project layout (dark sidebar, full-height)
import ProjectLayout from './pages/ProjectLayout'
import ProjectView from './pages/ProjectView'

// Legacy pages
import Upload from './pages/Upload'
import SchemaPage from './pages/SchemaPage'
import Review from './pages/Review'
import Analytics from './pages/Analytics'

// Canonical project pages
import StudiesPage from './pages/project/StudiesPage'
import ExperimentsPage from './pages/project/ExperimentsPage'
import DatasetPage from './pages/project/DatasetPage'
import NormalizationPage from './pages/project/NormalizationPage'
import MissingDataPage from './pages/project/MissingDataPage'
import TreatmentsPage from './pages/project/TreatmentsPage'
import ThresholdShelfLifePage from './pages/project/ThresholdShelfLifePage'
import PipelineJobsPage from './pages/project/PipelineJobsPage'
import ExtractionWorkspacePage from './pages/project/ExtractionWorkspacePage'
import PPChart2TablePage from './pages/project/PPChart2TablePage'
import ValidationPage from './pages/project/ValidationPage'
import AuditHistoryPage from './pages/project/AuditHistoryPage'
import ExportPage from './pages/project/ExportPage'
import TeamPage from './pages/project/TeamPage'
import ProjectSettingsPage from './pages/project/ProjectSettingsPage'

// Paper-centric workflow pages
import PaperShell from './pages/project/PaperShell'
import DoclingResultsPage from './pages/project/DoclingResultsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

// Signed-out visitors see the marketing Landing page at "/"; signed-in users
// see the Dashboard through the normal top-nav Layout — same route, no
// redirect either way, so "/" always resolves to the right thing.
function RootGate() {
  const token = useAuthStore((s) => s.token)
  return token ? <Layout /> : <Landing />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Dashboard — uses top-nav Layout; Landing when signed out */}
      <Route path="/" element={<RootGate />}>
        <Route index element={<Dashboard />} />
        <Route path="profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      </Route>

      {/* Project section — full-height dark-sidebar layout, no global header */}
      <Route
        path="/projects/:projectId"
        element={<RequireAuth><ProjectLayout /></RequireAuth>}
      >
        <Route index element={<ProjectView />} />

        {/* Legacy */}
        <Route path="upload" element={<Upload />} />
        <Route path="schema" element={<SchemaPage />} />
        <Route path="review" element={<Review />} />
        <Route path="analytics" element={<Analytics />} />

        {/* Canonical scientific data */}
        <Route path="studies" element={<StudiesPage />} />
        <Route path="experiments" element={<ExperimentsPage />} />
        <Route path="dataset" element={<DatasetPage />} />

        {/* Data quality */}
        <Route path="normalization" element={<NormalizationPage />} />
        <Route path="missing" element={<MissingDataPage />} />

        {/* Analysis */}
        <Route path="treatments" element={<TreatmentsPage />} />
        <Route path="thresholds" element={<ThresholdShelfLifePage />} />

        {/* The project dashboard is now the paper library. Keep the old URL
            as a compatibility redirect so bookmarks do not break. */}
        <Route path="papers" element={<Navigate to=".." replace />} />

        {/* Paper-centric workflow — each paper has its own sub-nav shell */}
        <Route path="papers/:paperId" element={<PaperShell />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview"    element={<ExtractionWorkspacePage />} />
          <Route path="docling"     element={<DoclingResultsPage />} />
          <Route path="charts"      element={<PPChart2TablePage />} />
          <Route path="validation"  element={<ValidationPage />} />
          <Route path="review"      element={<Review />} />
          <Route path="database"    element={<DatasetPage />} />
          {/* Legacy URL redirects */}
          <Route path="workspace"   element={<Navigate to="overview" replace />} />
          <Route path="chart2table" element={<Navigate to="charts" replace />} />
        </Route>

        {/* Project-wide validation */}
        <Route path="validation" element={<ValidationPage />} />

        {/* Operations — admin diagnostic */}
        <Route path="jobs" element={<PipelineJobsPage />} />
        <Route path="audit" element={<AuditHistoryPage />} />
        <Route path="export" element={<ExportPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="settings" element={<ProjectSettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
