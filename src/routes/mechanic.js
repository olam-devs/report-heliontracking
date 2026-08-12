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
router.get('/all-vehicles',               requireMechanic, c.allVehicles);
router.get('/vehicle-status/:devIdno',    requireMechanic, c.vehicleStatus);
router.post('/logs',                      requireMechanic, c.addLog);
router.post('/logs/:logId/attachments', requireMechanic, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `File too large — maximum is 200 MB`
        : err.message || 'Upload failed';
      return res.status(413).json({ success: false, error: msg });
    }
    next();
  });
}, c.addAttachment);
router.get('/my-logs',                    requireMechanic, c.myLogs);
router.get('/my-worked-vehicles',         requireMechanic, c.myWorkedVehicles);
router.get('/my-all-notes',               requireMechanic, c.myAllNotes);
router.get('/admin-notes/:devIdno',       requireMechanic, c.adminNotes);
router.get('/pending',                    requireMechanic, c.getPendingVehicles);

// Mechanic: mark notes read
router.post('/mark-notes-read/:devIdno',  requireMechanic, c.markNotesRead);

// Admin-only routes
router.get('/admin/unread-count',         requireAdmin, c.adminUnreadCount);
router.post('/admin/mark-logs-read',      requireAdmin, c.adminMarkLogsRead);
router.get('/admin/mechanics',            requireAdmin, c.adminMechanics);
router.get('/admin/access',               requireAdmin, c.adminListAccess);
router.post('/admin/access',              requireAdmin, c.adminGrantAccess);
router.delete('/admin/access/:id',        requireAdmin, c.adminRevokeAccess);
router.get('/admin/logs',                 requireAdmin, c.adminLogs);
router.get('/admin/vehicle-history',      requireAdmin, c.adminVehicleHistory);
router.get('/admin/notes',                requireAdmin, c.adminAllNotes);
router.post('/admin/notes',               requireAdmin, c.adminAddNote);
router.put('/admin/notes/:id',            requireAdmin, c.adminEditNote);
router.delete('/admin/notes/:id',         requireAdmin, c.adminDeleteNote);
router.post('/admin/pending',             requireAdmin, c.markPending);
router.delete('/admin/pending/:devIdno',  requireAdmin, c.unmarkPending);

module.exports = router;
