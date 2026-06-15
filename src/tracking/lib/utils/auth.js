const logger = require('../utils/logger');

module.exports = function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  const expected = process.env.MIDDLEWARE_API_KEY;

  // Warn in dev if key not set
  if (!expected || expected === 'generate_a_strong_random_key_here') {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('[Auth] No MIDDLEWARE_API_KEY set — running open in dev mode');
      return next();
    }
    return res.status(500).json({ success: false, message: 'Server misconfiguration: API key not set' });
  }

  if (!key || key !== expected) {
    logger.warn(`[Auth] Rejected request from ${req.ip} — invalid API key`);
    return res.status(401).json({ success: false, message: 'Unauthorized: invalid or missing X-API-Key header' });
  }

  next();
};
