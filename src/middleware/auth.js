const jwt = require('jsonwebtoken');
const UserModel = require('../models/UserModel');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await UserModel.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.is_active) return res.status(403).json({ error: 'Account is inactive. Contact your administrator.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports.requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports.requireTracking = (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.can_view_tracking) {
    return next();
  }
  return res.status(403).json({ error: 'Tracking / Daily Fleet Report access required' });
};

module.exports.requireTrackingPage = (page, level = 'view') => (req, res, next) => {
  const { canAccessTrackingPage } = require('../tracking/tracking-permissions');
  if (!canAccessTrackingPage(req.user, page, level)) {
    return res.status(403).json({ error: `No ${level} access to fleet tracking page: ${page}` });
  }
  next();
};

module.exports.requireAnyTrackingPage = (pages, level = 'view') => (req, res, next) => {
  const { canViewAnyTrackingPage, canEditAnyTrackingPage } = require('../tracking/tracking-permissions');
  const ok = level === 'edit'
    ? canEditAnyTrackingPage(req.user, pages)
    : canViewAnyTrackingPage(req.user, pages);
  if (!ok) {
    return res.status(403).json({ error: `No ${level} access to fleet tracking` });
  }
  next();
};
