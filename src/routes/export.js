const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/exportController');

router.get('/:id/export/pdf',  auth, c.pdf);
router.get('/:id/export/docx', auth, c.docx);

module.exports = router;
