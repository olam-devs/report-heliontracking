const router = require('express').Router();
const jwt = require('jsonwebtoken');
const UserModel = require('../models/UserModel');
const cms = require('../tracking/lib/services/cmsv6.service');

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
      data: statuses.map(v => ({
        devIdno:  String(v.devIdno || v.id || ''),
        plate:    v.plate || v.nm || v.abbr || String(v.devIdno || v.id || ''),
        group:    v.pnm  || null,
        lat:      v.lat  ?? null,
        lng:      v.lng  ?? null,
        online:   (v.ol ?? v.online ?? 0) !== 0,
        gpsTime:  v.gpsTime ?? v.gt ?? null,
        speed:    v.speed   ?? null,
        gpsValid: v.lat != null && v.lng != null && (Math.abs(v.lat) > 0.001 || Math.abs(v.lng) > 0.001),
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
