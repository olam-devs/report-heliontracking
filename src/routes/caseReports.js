const router = require('express').Router({ mergeParams: true });
const auth = require('../middleware/auth');
const c = require('../controllers/caseReportsController');

router.get('/',         auth, c.get);
router.post('/',        auth, c.create);
router.put('/',         auth, c.save);
router.patch('/publish',auth, c.publish);
router.get('/pdf',      auth, c.downloadPdf);

module.exports = router;
