const router = require('express').Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const c = require('../controllers/casesController');
const ev = require('../controllers/evidenceController');

router.get('/',     auth, c.list);
router.post('/',    auth, c.create);
router.get('/:id',  auth, c.show);
router.put('/:id',  auth, c.update);
router.delete('/:id', auth, c.destroy);

// Driver linking
router.post('/:caseId/drivers/:driverId',   auth, c.linkDriver);
router.delete('/:caseId/drivers/:driverId', auth, c.unlinkDriver);

// General (case-level) evidence
router.post('/:caseId/evidence', auth, upload.single('file'), ev.uploadToCase);
router.get('/:caseId/evidence',  auth, c.listGeneralEvidence);

// Hearing date (admin/HR only to set; all authenticated to read upcoming)
router.put('/:id/hearing',    auth, c.setHearing);
router.delete('/:id/hearing', auth, c.clearHearing);
router.get('/hearings/upcoming', auth, c.upcomingHearings);

module.exports = router;
