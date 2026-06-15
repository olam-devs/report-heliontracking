/** Per-page access for Fleet Tracking: 'edit' | 'view' | 'none' */

const TRACKING_PAGES = [
  'daily_report',
  'fuel_alerts',
  'notifications',
  'calibration',
  'danger_zones',
];

const PAGE_LABELS = {
  daily_report: 'Daily fleet report',
  fuel_alerts: 'Fuel alerts',
  notifications: 'Notifications',
  calibration: 'Calibration',
  danger_zones: 'Danger zones',
};

const DEFAULT_VIEW_ACCESS = {
  daily_report: 'view',
  fuel_alerts: 'view',
  notifications: 'view',
  calibration: 'view',
  danger_zones: 'view',
};

const ADMIN_ACCESS = Object.fromEntries(TRACKING_PAGES.map((p) => [p, 'edit']));

function normalizeLevel(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'edit' || s === 'view') return s;
  return 'none';
}

function parseTrackingPageAccess(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return parseTrackingPageAccess(JSON.parse(raw)); } catch { return null; }
  }
  if (typeof raw !== 'object') return null;
  const out = {};
  for (const p of TRACKING_PAGES) {
    if (raw[p] != null) out[p] = normalizeLevel(raw[p]);
  }
  return Object.keys(out).length ? out : null;
}

function resolveTrackingPageAccess(user) {
  if (!user) return null;
  if (user.role === 'admin') return { ...ADMIN_ACCESS };
  if (!user.can_view_tracking) return null;
  const custom = parseTrackingPageAccess(user.tracking_page_access);
  if (custom) {
    const out = { ...DEFAULT_VIEW_ACCESS };
    for (const p of TRACKING_PAGES) {
      if (custom[p]) out[p] = custom[p];
    }
    return out;
  }
  return { ...DEFAULT_VIEW_ACCESS };
}

function canAccessTrackingPage(user, page, need = 'view') {
  const access = resolveTrackingPageAccess(user);
  if (!access) return false;
  const level = access[page] || 'none';
  if (level === 'none') return false;
  if (need === 'view') return level === 'view' || level === 'edit';
  return level === 'edit';
}

function canEditTrackingPage(user, page) {
  return canAccessTrackingPage(user, page, 'edit');
}

function canViewAnyTrackingPage(user, pages) {
  return pages.some((p) => canAccessTrackingPage(user, p, 'view'));
}

function canEditAnyTrackingPage(user, pages) {
  return pages.some((p) => canAccessTrackingPage(user, p, 'edit'));
}

module.exports = {
  TRACKING_PAGES,
  PAGE_LABELS,
  DEFAULT_VIEW_ACCESS,
  parseTrackingPageAccess,
  resolveTrackingPageAccess,
  canAccessTrackingPage,
  canEditTrackingPage,
  canViewAnyTrackingPage,
  canEditAnyTrackingPage,
};
