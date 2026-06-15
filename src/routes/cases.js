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

module.exports = router;
