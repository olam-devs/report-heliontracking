const { verifyToken } = require('../services/auth-jwt.service');
const delivery = require('../services/delivery.service');

function getBearer(req) {
  const h = req.headers.authorization || '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

module.exports = function requireDeliveryActor(actorType) {
  return (req, res, next) => {
    try {
      const token = getBearer(req);
      if (!token) {
        return res.status(401).json({ success: false, message: 'Missing Authorization: Bearer token' });
      }
      const decoded = verifyToken(token);
      if (decoded.kind !== 'delivery' || decoded.actorType !== actorType) {
        return res.status(403).json({ success: false, message: 'Invalid token for this app' });
      }
      const actor = actorType === 'customer'
        ? delivery.findCustomerById(decoded.sub)
        : delivery.findDriverById(decoded.sub);
      if (!actor) {
        return res.status(401).json({ success: false, message: 'Account not found' });
      }
      req.deliveryActor = {
        id: actor.id,
        phone: actor.phone,
        name: actor.name,
        actorType,
      };
      next();
    } catch (e) {
      res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
  };
};
