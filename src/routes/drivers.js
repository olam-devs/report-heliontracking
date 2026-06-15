const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/driversController');

router.get('/',      auth, c.list);
router.post('/',     auth, c.create);
router.get('/:id',   auth, c.show);
router.put('/:id',   auth, c.update);
router.delete('/:id', auth, c.destroy);

// Case linking from driver page
router.post('/:id/cases/:caseId',   auth, c.linkCase);
router.delete('/:id/cases/:caseId', auth, c.unlinkCase);

module.exports = router;
