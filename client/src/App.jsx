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
import MechanicPortal from './pages/MechanicPortal';
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

function MechanicRoute({ children }) {
  const { user } = useAuth();
  const can = user?.role === 'admin' || user?.role === 'mechanic';
  return can ? children : <Navigate to="/drivers" replace />;
}

function DefaultRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'mechanic' ? '/mechanic' : '/drivers'} replace />;
}

function NonMechanicRoute({ children }) {
  const { user } = useAuth();
  return user?.role === 'mechanic' ? <Navigate to="/mechanic" replace /> : children;
}

function AppRoutes() {
  const { isAuthenticated, user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <DefaultRedirect /> : <Login />} />
      {/* Full-screen report editor (no sidebar) */}
      <Route path="/cases/:id/report" element={<ProtectedRoute><ReportEditor /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DefaultRedirect />} />
        <Route path="drivers" element={<NonMechanicRoute><DriversList /></NonMechanicRoute>} />
        <Route path="drivers/:id" element={<NonMechanicRoute><DriverDetail /></NonMechanicRoute>} />
        <Route path="cases" element={<NonMechanicRoute><CasesList /></NonMechanicRoute>} />
        <Route path="cases/:id" element={<NonMechanicRoute><CaseDetail /></NonMechanicRoute>} />
        <Route path="cases/:id/preview" element={<NonMechanicRoute><ExportPreview /></NonMechanicRoute>} />
        <Route path="report-templates" element={<NonMechanicRoute><ReportTemplates /></NonMechanicRoute>} />
        <Route path="users" element={<NonMechanicRoute><Users /></NonMechanicRoute>} />
        <Route path="mechanic" element={<MechanicRoute><MechanicPortal /></MechanicRoute>} />
        <Route path="tracking" element={<ProtectedRoute><TrackingRoute><TrackingPortal /></TrackingRoute></ProtectedRoute>}>
          <Route index element={<TrackingDailyReport />} />
          <Route path="fuel-alerts" element={<TrackingFuelAlerts />} />
          <Route path="notifications" element={<TrackingNotifications />} />
          <Route path="calibration" element={<TrackingCalibration />} />
          <Route path="danger-zones" element={<TrackingDangerZones />} />
        </Route>
      </Route>
      <Route path="*" element={<DefaultRedirect />} />
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
