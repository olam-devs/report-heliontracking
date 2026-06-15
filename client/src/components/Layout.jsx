import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';

const navLink = (collapsed) => ({ isActive }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
  } ${collapsed ? 'justify-center px-2' : ''}`;

const NavItem = ({ to, icon, label, collapsed, badge }) => (
  <NavLink to={to} className={navLink(collapsed)} title={collapsed ? label : undefined}>
    <span className="relative shrink-0">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </span>
    {!collapsed && <span>{label}</span>}
  </NavLink>
);

const ICONS = {
  drivers: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  cases:   'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  users:   'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  templates:'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
  tracking:'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
  logout:  'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  collapse:'M11 19l-7-7 7-7m8 14l-7-7 7-7',
  expand:  'M13 5l7 7-7 7M5 5l7 7-7 7',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const canTrack = isAdmin || user?.can_view_tracking;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!canTrack) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/tracking/notifications/unread-count', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const json = await res.json();
      setUnreadNotifs(json.data?.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, [canTrack]);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 5 * 60 * 1000);
    const onSeen = () => setUnreadNotifs(0);
    window.addEventListener('tracking-notifications-seen', onSeen);
    return () => {
      clearInterval(id);
      window.removeEventListener('tracking-notifications-seen', onSeen);
    };
  }, [fetchUnread]);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0'); } catch {}
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    logout();
    navigate('/login');
    toast.success('Logged out');
  };

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`shrink-0 bg-brand-900 text-white flex flex-col transition-all duration-200 ${
          collapsed ? 'w-14' : 'w-56'
        }`}
      >
        {/* Logo + collapse toggle */}
        <div className={`border-b border-white/10 flex flex-col items-center py-3 ${collapsed ? 'px-1' : 'px-4'}`}>
          {!collapsed && (
            <img
              src="/logo.svg"
              alt="Helion Tracking"
              style={{ height: '56px', width: 'auto', filter: 'brightness(0) invert(1) drop-shadow(0 0 8px rgba(129,140,248,0.4))' }}
            />
          )}
          {!collapsed && (
            <span className="font-brand text-white/60 text-[9px] tracking-[0.2em] uppercase mt-1 mb-1">
              Incident Reporter
            </span>
          )}
          {collapsed && (
            <img
              src="/logo.svg"
              alt=""
              style={{ height: '32px', width: 'auto', filter: 'brightness(0) invert(1)', margin: '4px 0' }}
            />
          )}
          <button
            onClick={toggleSidebar}
            className="mt-1 w-full flex items-center justify-center py-1 rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={collapsed ? ICONS.expand : ICONS.collapse} />
            </svg>
            {!collapsed && <span className="text-[10px] ml-1 tracking-wider">Collapse</span>}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5">
          <NavItem to="/drivers"  icon={ICONS.drivers}  label="Drivers"    collapsed={collapsed} />
          <NavItem to="/cases"    icon={ICONS.cases}    label="All Cases"  collapsed={collapsed} />
          {canTrack && (
            <NavItem to="/tracking" icon={ICONS.tracking} label="Fleet Tracking" collapsed={collapsed} badge={unreadNotifs} />
          )}

          {isAdmin && (
            <>
              {!collapsed && (
                <div className="pt-3 pb-1">
                  <p className="px-3 text-[10px] font-semibold text-white/30 uppercase tracking-wider">Admin</p>
                </div>
              )}
              {collapsed && <div className="border-t border-white/10 my-2" />}
              <NavItem to="/users"            icon={ICONS.users}     label="Users"             collapsed={collapsed} />
              <NavItem to="/report-templates" icon={ICONS.templates} label="Report Templates"  collapsed={collapsed} />
            </>
          )}
        </nav>

        {/* Footer */}
        <div className={`border-t border-white/10 p-2 ${collapsed ? '' : 'px-3'}`}>
          {!collapsed && (
            <div className="px-1 py-1 mb-1">
              <div className="text-sm font-medium text-white truncate">{user?.name}</div>
              <div className="text-xs text-white/50 capitalize">{user?.role}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Logout' : undefined}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS.logout} />
            </svg>
            {!collapsed && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
