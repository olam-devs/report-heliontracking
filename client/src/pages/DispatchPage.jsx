import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import LiveMap from '../tracking/LiveMap';
import { ThemeProvider } from '../tracking/theme';

export default function DispatchPage() {
  const { user } = useAuth();
  const can = user?.role === 'admin' || user?.can_view_dispatch || user?.can_view_tracking;
  if (!can) return <Navigate to="/drivers" replace />;
  return (
    <ThemeProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <LiveMap user={user} />
      </div>
    </ThemeProvider>
  );
}
