const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

function mapVehicle(v) {
  const hasFix = v.lat != null && v.lng != null &&
    (Math.abs(v.lat) > 0.001 || Math.abs(v.lng) > 0.001);
  const pk = v.pk ?? null;
  const satellites = v.satellites ?? null;
  const gpsLocked = pk != null ? pk > 0 : satellites != null ? satellites > 0 : hasFix;
  return {
    devIdno:  String(v.devIdno || v.id || ''),
    plate:    v.plate || v.nm || v.abbr || String(v.devIdno || v.id || ''),
    group:    v.pnm  || null,
    lat:      v.lat  ?? null,
    lng:      v.lng  ?? null,
    online:   (v.ol ?? v.online ?? 0) !== 0,
    gpsTime:  v.gpsTime ?? v.gt ?? null,
    speed:    v.speed   ?? null,
    satellites,
    gpsValid: hasFix && gpsLocked,
    gpsLocked,
  };
}

router.get('/live-map', authDispatch, async (req, res) => {
  try {
    const statuses = await cms.getAllGPS().catch(() => []);
    const isAdmin = req.user.role === 'admin' || req.user.can_view_tracking;
    const assignedVehicles = req.user.dispatch_vehicles;
    const filterSet = (!isAdmin && Array.isArray(assignedVehicles) && assignedVehicles.length > 0)
      ? new Set(assignedVehicles.map(String))
      : null;

    let data = statuses.map(mapVehicle);
    if (filterSet) data = data.filter(v => filterSet.has(v.devIdno));

    res.json({ success: true, data, isAdmin });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// List dispatch users (admin only)
router.get('/users', authDispatch, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  try {
    const all = await UserModel.findAll();
    const users = all
      .filter(u => u.can_view_dispatch && u.role !== 'admin')
      .map(u => ({
        id: u.id, name: u.name, email: u.email,
        dispatch_vehicles: u.dispatch_vehicles || [],
      }));
    res.json({ success: true, data: users });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Assign vehicles to a dispatch user (admin only)
router.put('/users/:id/vehicles', authDispatch, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { vehicles } = req.body;
  if (!Array.isArray(vehicles)) return res.status(400).json({ success: false, error: 'vehicles must be an array' });
  try {
    await UserModel.update(parseInt(req.params.id), { dispatch_vehicles: vehicles });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Reset password for a dispatch user (admin only)
router.put('/users/:id/password', authDispatch, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    await UserModel.updatePassword(parseInt(req.params.id), hashed);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Reverse geocode
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
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const all = await cms.getAllGPS().catch(() => []);
    const v = all.find(x => (x.plate || x.vid || x.abbr || '').toLowerCase() === req.params.plate.toLowerCase());
    if (!v) return res.json({ found: false });
    res.json({ found: true, raw: v });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
