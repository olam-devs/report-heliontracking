const router = require('express').Router();
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/uploadMechanic');
const c = require('../controllers/mechanicController');

const requireMechanic = (req, res, next) => {
  if (req.user?.role === 'mechanic' || req.user?.role === 'admin') return next();
  return res.status(403).json({ success: false, error: 'Mechanic access required' });
};

router.use(auth);

// Mechanic routes
router.get('/my-vehicles',                requireMechanic, c.myVehicles);
router.get('/vehicle-status/:devIdno',    requireMechanic, c.vehicleStatus);
router.post('/logs',                      requireMechanic, c.addLog);
router.post('/logs/:logId/attachments',   requireMechanic, upload.single('file'), c.addAttachment);
router.get('/my-logs',                    requireMechanic, c.myLogs);
router.get('/admin-notes/:devIdno',       requireMechanic, c.adminNotes);

// Admin-only routes
router.get('/admin/mechanics',            requireAdmin, c.adminMechanics);
router.get('/admin/access',               requireAdmin, c.adminListAccess);
router.post('/admin/access',              requireAdmin, c.adminGrantAccess);
router.delete('/admin/access/:id',        requireAdmin, c.adminRevokeAccess);
router.get('/admin/logs',                 requireAdmin, c.adminLogs);
router.get('/admin/notes',                requireAdmin, c.adminAllNotes);
router.post('/admin/notes',               requireAdmin, c.adminAddNote);
router.delete('/admin/notes/:id',         requireAdmin, c.adminDeleteNote);

module.exports = router;
