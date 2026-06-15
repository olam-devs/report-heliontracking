const router = require('express').Router();
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const c = require('../controllers/usersController');

// All user management is admin-only
router.get('/',                     auth, requireAdmin, c.list);
router.post('/',                    auth, requireAdmin, c.create);
router.get('/:id',                  auth, requireAdmin, c.show);
router.put('/:id',                  auth, requireAdmin, c.update);
router.patch('/:id/password',       auth, requireAdmin, c.updatePassword);
router.patch('/:id/toggle-active',  auth, requireAdmin, c.toggleActive);
router.delete('/:id',               auth, requireAdmin, c.destroy);

module.exports = router;
