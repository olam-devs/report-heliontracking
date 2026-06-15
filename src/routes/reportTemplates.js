const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/reportTemplatesController');

router.get('/',           auth, c.list);
router.get('/default',    auth, c.getDefault);
router.get('/:id',        auth, c.show);
router.post('/',          auth, auth.requireAdmin, c.create);
router.put('/:id',        auth, auth.requireAdmin, c.update);
router.patch('/:id/default',   auth, auth.requireAdmin, c.setDefault);
router.post('/:id/duplicate',  auth, auth.requireAdmin, c.duplicate);
router.delete('/:id',     auth, auth.requireAdmin, c.destroy);

module.exports = router;
