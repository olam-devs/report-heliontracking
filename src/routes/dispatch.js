const router = require('express').Router();
const jwt = require('jsonwebtoken');
const UserModel = require('../models/UserModel');
const cms = require('../tracking/lib/services/cmsv6.service');
const geocode = require('../tracking/lib/utils/geocode-cache');

async function authDispatch(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const user = await UserModel.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    if (!user.is_active) return res.status(403).json({ success: false, error: 'Account is inactive' });
    if (user.role !== 'admin' && !user.can_view_tracking && !user.can_view_dispatch) {
      return res.status(403).json({ success: false, error: 'Dispatch access required' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

router.get('/live-map', authDispatch, async (req, res) => {
  try {
    const statuses = await cms.getAllGPS().catch(() => []);
    res.json({
      success: true,
      data: statuses.map(v => {
        const hasFix = v.lat != null && v.lng != null &&
          (Math.abs(v.lat) > 0.001 || Math.abs(v.lng) > 0.001);
        const satellites = v.satellites ?? (v.ns != null ? v.ns : null);
        // accOn uses JT/T 808 s1 bit-1 which on these devices = GPS positioning status
        const accOn = v.accOn ?? null;
        // gpsLocked: use satellites if available, else accOn if available, else coords-only
        const gpsLocked = satellites != null ? satellites > 0
                        : accOn != null      ? accOn
                        : hasFix;
        return {
          devIdno:    String(v.devIdno || v.id || ''),
          plate:      v.plate || v.nm || v.abbr || String(v.devIdno || v.id || ''),
          group:      v.pnm  || null,
          lat:        v.lat  ?? null,
          lng:        v.lng  ?? null,
          online:     (v.ol ?? v.online ?? 0) !== 0,
          gpsTime:    v.gpsTime ?? v.gt ?? null,
          speed:      v.speed   ?? null,
          satellites,
          accOn,
          gpsValid:   hasFix && gpsLocked,
          gpsLocked,
        };
      }),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Reverse geocode a lat/lng — uses cached Nominatim lookups
router.get('/geocode', authDispatch, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) return res.json({ name: null });
  try {
    const name = await geocode.resolve(lat, lng);
    res.json({ name: name || null });
  } catch { res.json({ name: null }); }
});

// Debug: raw CMSV fields for a specific plate (admin only)
router.get('/raw/:plate', authDispatch, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const all = await cms.getAllGPS().catch(() => []);
    const v = all.find(x => (x.plate || x.vid || x.abbr || '').toLowerCase() === req.params.plate.toLowerCase());
    if (!v) return res.json({ found: false });
    res.json({ found: true, raw: v });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
