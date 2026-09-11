const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const UserModel = require('../models/UserModel');
const db = require('../config/db');
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
  const gpsUntargeted = (v.s2 != null) ? ((v.s2 & 0x40000) !== 0) : false;
  const satellites = v.satellites ?? null;
  const gpsLocked = gpsUntargeted ? false : hasFix;
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

// Public reverse geocode (token validates the caller is a real link viewer)
router.get('/public-geocode', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const token = req.query.token;
  if (isNaN(lat) || isNaN(lng) || !token) return res.json({ name: null });
  try {
    const [rows] = await db.query('SELECT id FROM dispatch_links WHERE token = ?', [token]);
    if (!rows.length) return res.json({ name: null });
    const name = await geocode.resolve(lat, lng);
    res.json({ name: name || null });
  } catch { res.json({ name: null }); }
});

// ── Dispatch Links (shareable, time-limited, no-auth) ───────────────────────

// List links (admin only)
router.get('/links', authDispatch, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  try {
    const [rows] = await db.query('SELECT * FROM dispatch_links WHERE created_by = ? ORDER BY created_at DESC', [req.user.id]);
    const data = rows.map(r => ({ ...r, vehicles: JSON.parse(r.vehicles || '[]') }));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Create link (admin only)
router.post('/links', authDispatch, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { name, vehicles, starts_at, ends_at } = req.body;
  if (!name || !Array.isArray(vehicles) || !ends_at) {
    return res.status(400).json({ success: false, error: 'name, vehicles[], and ends_at are required' });
  }
  try {
    const token = crypto.randomBytes(24).toString('hex');
    await db.query(
      'INSERT INTO dispatch_links (token, name, vehicles, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [token, name, JSON.stringify(vehicles), starts_at || null, ends_at, req.user.id]
    );
    const [rows] = await db.query('SELECT * FROM dispatch_links WHERE token = ?', [token]);
    const row = { ...rows[0], vehicles: JSON.parse(rows[0].vehicles) };
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Update link vehicles/name/times (admin only)
router.put('/links/:id', authDispatch, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  const { name, vehicles, starts_at, ends_at } = req.body;
  try {
    const [existing] = await db.query('SELECT * FROM dispatch_links WHERE id = ? AND created_by = ?', [req.params.id, req.user.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Link not found' });
    await db.query(
      'UPDATE dispatch_links SET name = ?, vehicles = ?, starts_at = ?, ends_at = ? WHERE id = ?',
      [
        name ?? existing[0].name,
        vehicles ? JSON.stringify(vehicles) : existing[0].vehicles,
        starts_at !== undefined ? (starts_at || null) : existing[0].starts_at,
        ends_at ?? existing[0].ends_at,
        req.params.id,
      ]
    );
    const [rows] = await db.query('SELECT * FROM dispatch_links WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: { ...rows[0], vehicles: JSON.parse(rows[0].vehicles) } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Delete link (admin only)
router.delete('/links/:id', authDispatch, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
  try {
    await db.query('DELETE FROM dispatch_links WHERE id = ? AND created_by = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Public: validate token + stream live vehicles (NO AUTH)
router.get('/public/:token', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM dispatch_links WHERE token = ?', [req.params.token]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Link not found' });
    const link = rows[0];
    const now = new Date();
    if (link.starts_at && now < new Date(link.starts_at)) {
      return res.status(403).json({ success: false, error: 'not_started', starts_at: link.starts_at });
    }
    if (now > new Date(link.ends_at)) {
      return res.status(410).json({ success: false, error: 'expired', ends_at: link.ends_at });
    }
    const allowedIds = new Set(JSON.parse(link.vehicles || '[]').map(String));
    const statuses = await cms.getAllGPS().catch(() => []);
    const data = statuses.map(mapVehicle).filter(v => allowedIds.has(v.devIdno));
    res.json({ success: true, name: link.name, ends_at: link.ends_at, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Debug: raw CMSV fields for a specific plate (admin only)
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
