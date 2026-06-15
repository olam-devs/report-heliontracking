const router = require('express').Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const c = require('../controllers/evidenceController');

// POST /api/steps/:stepId/evidence
router.post('/:stepId/evidence', auth, upload.single('file'), c.upload);

// PATCH /api/evidence/:fileId
router.patch('/:fileId', auth, c.update);

// DELETE /api/evidence/:fileId
router.delete('/:fileId', auth, c.destroy);

// GET /api/evidence/:fileId/download
router.get('/:fileId/download', auth, c.download);

module.exports = router;
