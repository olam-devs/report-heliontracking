import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import DriversList from './pages/DriversList';
import DriverDetail from './pages/DriverDetail';
import CasesList from './pages/CasesList';
import CaseDetail from './pages/CaseDetail';
import ExportPreview from './pages/ExportPreview';
import Users from './pages/Users';
import ReportEditor from './pages/ReportEditor';
import ReportTemplates from './pages/ReportTemplates';
import Layout from './components/Layout';
import TrackingPortal, {
  TrackingDailyReport,
  TrackingFuelAlerts,
  TrackingNotifications,
  TrackingCalibration,
  TrackingDangerZones,
} from './pages/TrackingPortal';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function TrackingRoute({ children }) {
  const { user } = useAuth();
  const can = user?.role === 'admin' || user?.can_view_tracking;
  return can ? children : <Navigate to="/drivers" replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/drivers" replace /> : <Login />} />
      {/* Full-screen report editor (no sidebar) */}
      <Route path="/cases/:id/report" element={<ProtectedRoute><ReportEditor /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/drivers" replace />} />
        <Route path="drivers" element={<DriversList />} />
        <Route path="drivers/:id" element={<DriverDetail />} />
        <Route path="cases" element={<CasesList />} />
        <Route path="cases/:id" element={<CaseDetail />} />
        <Route path="cases/:id/preview" element={<ExportPreview />} />
<Route path="report-templates" element={<ReportTemplates />} />
        <Route path="users" element={<Users />} />
        <Route path="tracking" element={<ProtectedRoute><TrackingRoute><TrackingPortal /></TrackingRoute></ProtectedRoute>}>
          <Route index element={<TrackingDailyReport />} />
          <Route path="fuel-alerts" element={<TrackingFuelAlerts />} />
          <Route path="notifications" element={<TrackingNotifications />} />
          <Route path="calibration" element={<TrackingCalibration />} />
          <Route path="danger-zones" element={<TrackingDangerZones />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/drivers" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
