const fs = require('fs');
const path = require('path');
const { isValidCoord } = require('./coord-utils');
const { haversineMetersLatLng } = require('./geo');
const { loadNotifications, isSeriousTheftAlert, filterCalibratedAlerts } = require('./fuel-insights.engine');

const DZ_FILE = path.join(__dirname, '../../data/tracking/danger-zones.json');
const RADIUS_M = 100;

function loadDangerZones() {
  try {
    if (fs.existsSync(DZ_FILE)) {
      return JSON.parse(fs.readFileSync(DZ_FILE, 'utf8'));
    }
  } catch (_) {}
  return { items: [] };
}

function saveDangerZones(store) {
  const dir = path.dirname(DZ_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DZ_FILE + '.tmp', JSON.stringify(store, null, 2));
  fs.renameSync(DZ_FILE + '.tmp', DZ_FILE);
}

function parseAtMs(at) {
  const s = String(at || '').trim();
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function formatFirstSeen(at) {
  if (!at) return null;
  return String(at).slice(0, 10);
}

function extractRawPointsFromAlert(alert) {
  const roles = [
    ['A', alert.from],
    ['B', alert.to],
    ['C', alert.pointC],
  ];
  const out = [];
  for (const [role, pt] of roles) {
    if (!pt || pt.unknown || !isValidCoord(pt.lat, pt.lng)) continue;
    out.push({
      alertId: alert.id,
      role,
      plate: alert.plate,
      lat: Number(pt.lat),
      lng: Number(pt.lng),
      name: pt.placeName || null,
      at: alert.at,
      atMs: parseAtMs(alert.at),
    });
  }
  return out;
}

function zoneIdFor(lat, lng) {
  return `dz-${lat.toFixed(5).replace('.', 'd')}-${lng.toFixed(5).replace('.', 'd')}`;
}

function findZoneWithinRadius(zones, lat, lng, radiusM = RADIUS_M) {
  for (const z of zones) {
    if (z.lat == null || z.lng == null) continue;
    const d = haversineMetersLatLng(lat, lng, z.lat, z.lng);
    if (d != null && d <= radiusM) return z;
  }
  return null;
}

function mergePointIntoZone(zone, pt) {
  zone.hitCount = (zone.hitCount || 1) + 1;
  if (!zone.sourceRefs) zone.sourceRefs = [];
  const key = `${pt.alertId}:${pt.role}`;
  if (!zone.sourceRefs.some((r) => `${r.alertId}:${r.role}` === key)) {
    zone.sourceRefs.push({
      alertId: pt.alertId,
      role: pt.role,
      plate: pt.plate,
      at: pt.at,
    });
  }
  if (pt.atMs != null && (zone.firstSeenMs == null || pt.atMs < zone.firstSeenMs)) {
    zone.firstSeenMs = pt.atMs;
    zone.firstSeenAt = pt.at;
  }
  if ((!zone.name || zone.name.includes(',')) && pt.name) {
    zone.name = pt.name;
  }
}

function createZoneFromPoint(pt) {
  return {
    id: zoneIdFor(pt.lat, pt.lng),
    lat: pt.lat,
    lng: pt.lng,
    name: pt.name || `${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}`,
    firstSeenAt: pt.at,
    firstSeenMs: pt.atMs,
    radiusM: RADIUS_M,
    hitCount: 1,
    sourceRefs: [{
      alertId: pt.alertId,
      role: pt.role,
      plate: pt.plate,
      at: pt.at,
    }],
  };
}

function clusterRawPoints(rawPoints) {
  const sorted = [...rawPoints].sort((a, b) => (a.atMs || 0) - (b.atMs || 0));
  const zones = [];
  for (const pt of sorted) {
    const existing = findZoneWithinRadius(zones, pt.lat, pt.lng);
    if (existing) {
      mergePointIntoZone(existing, pt);
    } else {
      zones.push(createZoneFromPoint(pt));
    }
  }
  return zones.sort((a, b) => (a.firstSeenMs || 0) - (b.firstSeenMs || 0));
}

function collectRawPointsFromAlerts(alerts) {
  const raw = [];
  for (const alert of alerts || []) {
    if (!isSeriousTheftAlert(alert)) continue;
    raw.push(...extractRawPointsFromAlert(alert));
  }
  return raw;
}

function registerDangerPointsFromAlerts(alerts) {
  const store = loadDangerZones();
  const zones = store.items || [];
  const before = zones.length;
  const raw = collectRawPointsFromAlerts(alerts);
  for (const pt of raw.sort((a, b) => (a.atMs || 0) - (b.atMs || 0))) {
    const existing = findZoneWithinRadius(zones, pt.lat, pt.lng);
    if (existing) {
      mergePointIntoZone(existing, pt);
    } else {
      zones.push(createZoneFromPoint(pt));
    }
  }
  store.items = zones.sort((a, b) => (a.firstSeenMs || 0) - (b.firstSeenMs || 0));
  saveDangerZones(store);
  return store.items.length - before;
}

function rebuildDangerZonesFromNotifications(getVehicleMeta) {
  const notif = loadNotifications();
  let items = notif.items || [];
  if (getVehicleMeta) items = filterCalibratedAlerts(items, getVehicleMeta);
  const raw = collectRawPointsFromAlerts(items);
  const zones = clusterRawPoints(raw);
  saveDangerZones({ items: zones });
  return zones.length;
}

function listDangerZones() {
  return (loadDangerZones().items || []).map((z) => ({
    ...z,
    firstSeenDate: formatFirstSeen(z.firstSeenAt),
  }));
}

function getDangerZone(id) {
  const z = listDangerZones().find((p) => p.id === id);
  return z || null;
}

function updateDangerZone(id, patch) {
  const store = loadDangerZones();
  const idx = (store.items || []).findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const next = {
    ...store.items[idx],
    ...patch,
    id: store.items[idx].id,
    lat: store.items[idx].lat,
    lng: store.items[idx].lng,
    radiusM: RADIUS_M,
    updatedAt: new Date().toISOString(),
  };
  store.items[idx] = next;
  saveDangerZones(store);
  return { ...next, firstSeenDate: formatFirstSeen(next.firstSeenAt) };
}

function alertHasPointNear(alert, lat, lng, radiusM = RADIUS_M) {
  const candidates = [alert.from, alert.to, alert.pointC].filter(Boolean);
  return candidates.some((p) => {
    if (p.unknown || !isValidCoord(p.lat, p.lng)) return false;
    const d = haversineMetersLatLng(lat, lng, Number(p.lat), Number(p.lng));
    return d != null && d <= radiusM;
  });
}

function notificationsNearDangerPoint(dz, { getVehicleMeta } = {}) {
  const notif = loadNotifications();
  let items = (notif.items || []).filter(isSeriousTheftAlert);
  if (getVehicleMeta) items = filterCalibratedAlerts(items, getVehicleMeta);
  if (dz.lat == null || dz.lng == null) return [];
  const radius = dz.radiusM || RADIUS_M;
  return items
    .filter((a) => alertHasPointNear(a, dz.lat, dz.lng, radius))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

module.exports = {
  RADIUS_M,
  loadDangerZones,
  registerDangerPointsFromAlerts,
  rebuildDangerZonesFromNotifications,
  listDangerZones,
  getDangerZone,
  updateDangerZone,
  notificationsNearDangerPoint,
  alertHasPointNear,
  clusterRawPoints,
};
