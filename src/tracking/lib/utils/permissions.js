const FEATURE_LIST = [
  // ERP
  'erp.read',
  'erp.org.write',
  'erp.assign.write',

  // Users
  'users.manage',

  // Fleet (high-level gating; UI maps to views)
  'fleet.view',
  'fleet.dashboard',
  'fleet.vehicles',
  'fleet.map',
  'fleet.cameras',
  'fleet.alarms',
  'fleet.notifications',
  'fleet.fuel',
  'fleet.reports',
  'fleet.analytics',
  'fleet.routes',
  'fleet.chat',
];

function normalizeFeatureArray(features) {
  if (!features) return [];
  if (Array.isArray(features)) return features.map(String).map(s => s.trim()).filter(Boolean);
  if (features === '*' || features.all === true) return ['*'];
  if (Array.isArray(features.allow)) return features.allow.map(String).map(s => s.trim()).filter(Boolean);
  return [];
}

function hasFeature(user, feature) {
  const arr = normalizeFeatureArray(user?.features);
  if (arr.includes('*')) return true;
  return arr.includes(feature);
}

function intersectFeatures(a, b) {
  const A = new Set(normalizeFeatureArray(a));
  const B = new Set(normalizeFeatureArray(b));
  if (A.has('*') && B.has('*')) return ['*'];
  if (A.has('*')) return [...B];
  if (B.has('*')) return [...A];
  return [...A].filter(x => B.has(x));
}

/**
 * Per-feature vehicle allow-lists (viewer). Keys are feature ids, e.g. fleet.map.
 * { "fleet.map": { "all": true } } — no devIdno filter for that feature.
 * { "fleet.reports": { "devIdnos": ["123"] } } — restrict to those devices for that feature;
 *   if global allowedDevIdnos is set, the effective set is intersection(global, devIdnos).
 */
function normalizeFeatureVehicleAccess(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!key || typeof val !== 'object' || val == null || Array.isArray(val)) continue;
    const k = String(key).trim();
    if (!k) continue;
    if (val.all === true) {
      out[k] = { all: true };
    } else if (Array.isArray(val.devIdnos)) {
      const devIdnos = [...new Set(val.devIdnos.map(String).map(s => s.trim()).filter(Boolean))];
      if (devIdnos.length) out[k] = { devIdnos };
    }
  }
  return out;
}

/**
 * @param {object} user — safe user object (viewer | admin | superadmin)
 * @param {string} featureKey — e.g. fleet.map, fleet.reports
 * @returns {null|Set<string>} null = no devIdno restriction; Set (possibly empty) = restrict
 */
function resolveAllowedDevIdnoSet(user, featureKey) {
  if (!user || user.role === 'superadmin' || user.role === 'admin') return null;

  const globalArr = Array.isArray(user.allowedDevIdnos)
    ? user.allowedDevIdnos.map(String).map(s => s.trim()).filter(Boolean)
    : [];
  const globalSet = new Set(globalArr);

  const fvaRoot = user.featureVehicleAccess && typeof user.featureVehicleAccess === 'object' && !Array.isArray(user.featureVehicleAccess)
    ? user.featureVehicleAccess
    : {};
  const fva = fvaRoot[String(featureKey || '').trim()] || null;

  if (fva && fva.all === true) return null;

  let featSet = null;
  if (fva && Array.isArray(fva.devIdnos) && fva.devIdnos.length) {
    featSet = new Set(fva.devIdnos.map(String).map(s => s.trim()).filter(Boolean));
  }

  if (featSet && featSet.size) {
    if (globalSet.size > 0) return new Set([...featSet].filter(x => globalSet.has(String(x))));
    return featSet;
  }

  if (globalSet.size > 0) return globalSet;
  return new Set();
}

module.exports = {
  FEATURE_LIST,
  normalizeFeatureArray,
  hasFeature,
  intersectFeatures,
  normalizeFeatureVehicleAccess,
  resolveAllowedDevIdnoSet,
};

