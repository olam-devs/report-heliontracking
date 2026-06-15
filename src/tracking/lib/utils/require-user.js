const { verifyToken } = require('../services/auth-jwt.service');
const users = require('../services/users.service');
const { normalizeFeatureArray, hasFeature, normalizeFeatureVehicleAccess } = require('./permissions');

function getBearer(req) {
  const h = req.headers.authorization || '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isWithinAccessHours(accessHours) {
  if (!accessHours || typeof accessHours !== 'object') return true;
  const start = String(accessHours.start || '').trim();
  const end = String(accessHours.end || '').trim();
  const tz = String(accessHours.tz || 'Africa/Dar_es_Salaam').trim() || 'Africa/Dar_es_Salaam';
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return true;
  // Current time in specified tz as HH:MM
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const hh = parts.find(p => p.type === 'hour')?.value;
  const mm = parts.find(p => p.type === 'minute')?.value;
  const now = `${hh}:${mm}`;
  // If end < start, window crosses midnight.
  if (end >= start) return now >= start && now <= end;
  return now >= start || now <= end;
}

module.exports = function requireUser(req, res, next) {
  try {
    const token = getBearer(req);
    if (!token) return res.status(401).json({ success: false, message: 'Missing Authorization: Bearer token' });
    const decoded = verifyToken(token);
    const u = users.findById(decoded.sub);
    if (!u || u.active === false) return res.status(401).json({ success: false, message: 'Invalid user' });
    if (!isWithinAccessHours(u.accessHours)) {
      return res.status(403).json({ success: false, message: 'Access is restricted at this time' });
    }
    const safeUser = {
      id: u.id,
      username: u.username,
      role: u.role,
      companyIds: u.companyIds || [],
      features: u.features || {},
      allowedDevIdnos: Array.isArray(u.allowedDevIdnos) ? u.allowedDevIdnos : [],
      featureVehicleAccess: normalizeFeatureVehicleAccess(u.featureVehicleAccess),
      accessHours: u.accessHours || null,
    };
    req.user = {
      ...safeUser,
      effectiveFeatures: normalizeFeatureArray(safeUser.features),
      hasFeature: (f) => hasFeature(safeUser, f),
    };
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

