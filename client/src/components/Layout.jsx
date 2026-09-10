import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';

function usePWAInstall() {
  const promptRef = useRef(null);
  const [canInstall, setCanInstall] = useState(false);
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); promptRef.current = e; setCanInstall(true); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setCanInstall(false));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  const install = async () => {
    if (!promptRef.current) return;
    promptRef.current.prompt();
    const { outcome } = await promptRef.current.userChoice;
    if (outcome === 'accepted') setCanInstall(false);
    promptRef.current = null;
  };
  return { canInstall, install };
}

function useMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

const ICONS = {
  drivers:  'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  cases:    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  users:    'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  templates:'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
  tracking: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
  dispatch: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  mechanic: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  logout:   'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  collapse: 'M11 19l-7-7 7-7m8 14l-7-7 7-7',
  expand:   'M13 5l7 7-7 7M5 5l7 7-7 7',
  menu:     'M4 6h16M4 12h16M4 18h16',
  close:    'M6 18L18 6M6 6l12 12',
  more:     'M5 12h.01M12 12h.01M19 12h.01',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
};

function Icon({ d, size = 4 }) {
  return (
    <svg className={`w-${size} h-${size}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  );
}

// Desktop sidebar nav item
const navLink = (collapsed) => ({ isActive }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
  } ${collapsed ? 'justify-center px-2' : ''}`;

function NavItem({ to, icon, label, collapsed, badge }) {
  return (
    <NavLink to={to} className={navLink(collapsed)} title={collapsed ? label : undefined}>
      <span className="relative shrink-0">
        <Icon d={icon} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

// Mobile bottom tab
function BottomTab({ to, icon, label, badge }) {
  return (
    <NavLink to={to} className={({ isActive }) =>
      `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-colors ${
        isActive ? 'text-brand-400' : 'text-white/50'
      }`
    }>
      <span className="relative">
        <Icon d={icon} size={5} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="text-[9px] font-medium leading-none">{label}</span>
    </NavLink>
  );
}

// Drawer nav item
function DrawerItem({ to, icon, label, badge, onClick }) {
  return (
    <NavLink to={to} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-b border-white/5 ${
          isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
        }`
      }>
      <span className="relative shrink-0">
        <Icon d={icon} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mobile = useMobile();

  const isAdmin   = user?.role === 'admin';
  const isMechanic = user?.role === 'mechanic';
  const canTrack   = isAdmin || user?.can_view_tracking;
  const canDispatch = isAdmin || user?.can_view_dispatch || user?.can_view_tracking;
  const canMechanic = isAdmin || isMechanic;

  const { canInstall, install } = usePWAInstall();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

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
    } catch {}
  }, [canTrack]);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 5 * 60 * 1000);
    const onSeen = () => setUnreadNotifs(0);
    window.addEventListener('tracking-notifications-seen', onSeen);
    return () => { clearInterval(id); window.removeEventListener('tracking-notifications-seen', onSeen); };
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

  // ── Mechanic layout (same for mobile/desktop) ──────────────────────────────
  if (isMechanic) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <header className="bg-brand-900 text-white px-4 py-3 flex items-center justify-between shrink-0 sticky top-0 z-10 shadow">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" style={{ height: 28, width: 'auto', filter: 'brightness(0) invert(1)' }} />
            <span className="text-sm font-semibold text-white/80">Mechanic Portal</span>
          </div>
          <div className="flex items-center gap-2">
            {canInstall && (
              <button onClick={install}
                className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors border border-white/20">
                <Icon d={ICONS.download} />
                <span className="hidden sm:inline">Install App</span>
              </button>
            )}
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <Icon d={ICONS.logout} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (mobile) {
    // Build bottom tabs: max 4 visible, rest in drawer
    const mainTabs = [
      { to: '/drivers',  icon: ICONS.drivers,  label: 'Drivers' },
      { to: '/cases',    icon: ICONS.cases,    label: 'Cases'   },
      ...(canTrack    ? [{ to: '/tracking', icon: ICONS.tracking, label: 'Fleet',    badge: unreadNotifs }] : []),
      ...(canDispatch ? [{ to: '/dispatch', icon: ICONS.dispatch, label: 'Dispatch' }] : []),
    ].slice(0, 4);

    return (
      <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
        {/* Top header */}
        <header className="bg-brand-900 text-white px-4 py-2.5 flex items-center justify-between shrink-0 shadow-md z-20">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Helion" style={{ height: 28, width: 'auto', filter: 'brightness(0) invert(1)' }} />
            <span className="text-xs font-semibold text-white/60 tracking-widest uppercase">Helion</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="text-right mr-2">
              <div className="text-xs font-semibold text-white leading-none">{user?.name}</div>
              <div className="text-[10px] text-white/50 capitalize">{user?.role}</div>
            </div>
            <button onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors">
              <Icon d={ICONS.menu} size={5} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

        {/* Bottom tab bar */}
        <nav className="shrink-0 bg-brand-900 border-t border-white/10 flex items-stretch"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {mainTabs.map(tab => (
            <BottomTab key={tab.to} {...tab} />
          ))}
          {/* More button */}
          <button onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-white/50 transition-colors">
            <Icon d={ICONS.more} size={5} />
            <span className="text-[9px] font-medium leading-none">More</span>
          </button>
        </nav>

        {/* Slide-in drawer overlay */}
        {drawerOpen && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setDrawerOpen(false)} />
            <div className="fixed top-0 right-0 bottom-0 w-72 bg-brand-900 z-50 flex flex-col shadow-2xl"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              {/* Drawer header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div>
                  <div className="text-sm font-bold text-white">{user?.name}</div>
                  <div className="text-xs text-white/50 capitalize">{user?.role}</div>
                </div>
                <button onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                  <Icon d={ICONS.close} />
                </button>
              </div>

              {/* Drawer nav */}
              <nav className="flex-1 overflow-y-auto py-2">
                <DrawerItem to="/drivers"  icon={ICONS.drivers}  label="Drivers"       onClick={() => setDrawerOpen(false)} />
                <DrawerItem to="/cases"    icon={ICONS.cases}    label="All Cases"     onClick={() => setDrawerOpen(false)} />
                {canTrack    && <DrawerItem to="/tracking" icon={ICONS.tracking} label="Fleet Tracking" badge={unreadNotifs} onClick={() => setDrawerOpen(false)} />}
                {canDispatch && <DrawerItem to="/dispatch" icon={ICONS.dispatch} label="Dispatch View"  onClick={() => setDrawerOpen(false)} />}
                {canMechanic && <DrawerItem to="/mechanic" icon={ICONS.mechanic} label="Mechanic"       onClick={() => setDrawerOpen(false)} />}
                {isAdmin && (
                  <>
                    <div className="px-4 pt-4 pb-1">
                      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Admin</p>
                    </div>
                    <DrawerItem to="/users"            icon={ICONS.users}     label="Users"            onClick={() => setDrawerOpen(false)} />
                    <DrawerItem to="/report-templates" icon={ICONS.templates} label="Report Templates" onClick={() => setDrawerOpen(false)} />
                  </>
                )}
              </nav>

              {/* Drawer footer */}
              <div className="border-t border-white/10 p-3 space-y-2">
                {canInstall && (
                  <button onClick={() => { install(); setDrawerOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-indigo-300 hover:bg-white/10 border border-indigo-400/30 transition-colors">
                    <Icon d={ICONS.download} />
                    Install App
                  </button>
                )}
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors">
                  <Icon d={ICONS.logout} />
                  Logout
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Desktop layout ─────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex overflow-hidden">
      <aside className={`shrink-0 bg-brand-900 text-white flex flex-col transition-all duration-200 ${collapsed ? 'w-14' : 'w-56'}`}>
        <div className={`border-b border-white/10 flex flex-col items-center py-3 ${collapsed ? 'px-1' : 'px-4'}`}>
          {!collapsed && (
            <img src="/logo.svg" alt="Helion Tracking"
              style={{ height: 56, width: 'auto', filter: 'brightness(0) invert(1) drop-shadow(0 0 8px rgba(129,140,248,0.4))' }} />
          )}
          {!collapsed && (
            <span className="font-brand text-white/60 text-[9px] tracking-[0.2em] uppercase mt-1 mb-1">Incident Reporter</span>
          )}
          {collapsed && (
            <img src="/logo.svg" alt=""
              style={{ height: 32, width: 'auto', filter: 'brightness(0) invert(1)', margin: '4px 0' }} />
          )}
          <button onClick={toggleSidebar}
            className="mt-1 w-full flex items-center justify-center py-1 rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon d={collapsed ? ICONS.expand : ICONS.collapse} />
            {!collapsed && <span className="text-[10px] ml-1 tracking-wider">Collapse</span>}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          <NavItem to="/drivers"  icon={ICONS.drivers}  label="Drivers"       collapsed={collapsed} />
          <NavItem to="/cases"    icon={ICONS.cases}    label="All Cases"     collapsed={collapsed} />
          {canTrack    && <NavItem to="/tracking" icon={ICONS.tracking} label="Fleet Tracking" collapsed={collapsed} badge={unreadNotifs} />}
          {canDispatch && <NavItem to="/dispatch" icon={ICONS.dispatch} label="Dispatch View"  collapsed={collapsed} />}
          {canMechanic && <NavItem to="/mechanic" icon={ICONS.mechanic} label="Mechanic"       collapsed={collapsed} />}
          {isAdmin && (
            <>
              {!collapsed && (
                <div className="pt-3 pb-1">
                  <p className="px-3 text-[10px] font-semibold text-white/30 uppercase tracking-wider">Admin</p>
                </div>
              )}
              {collapsed && <div className="border-t border-white/10 my-2" />}
              <NavItem to="/users"            icon={ICONS.users}     label="Users"            collapsed={collapsed} />
              <NavItem to="/report-templates" icon={ICONS.templates} label="Report Templates" collapsed={collapsed} />
            </>
          )}
        </nav>

        <div className={`border-t border-white/10 p-2 ${collapsed ? '' : 'px-3'}`}>
          {!collapsed && (
            <div className="px-1 py-1 mb-1">
              <div className="text-sm font-medium text-white truncate">{user?.name}</div>
              <div className="text-xs text-white/50 capitalize">{user?.role}</div>
            </div>
          )}
          {canInstall && (
            <button onClick={install}
              className={`w-full flex items-center gap-2 px-2 py-2 mb-1 rounded-lg text-sm text-indigo-300 hover:bg-white/10 hover:text-indigo-200 transition-colors border border-indigo-400/30 ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? 'Install App' : undefined}>
              <Icon d={ICONS.download} />
              {!collapsed && 'Install App'}
            </button>
          )}
          <button onClick={handleLogout}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Logout' : undefined}>
            <Icon d={ICONS.logout} />
            {!collapsed && 'Logout'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
