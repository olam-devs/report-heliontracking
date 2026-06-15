const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/stepsController');

router.get('/:id/steps',                  auth, c.list);
router.post('/:id/steps',                 auth, c.create);
router.put('/:id/steps/:stepId',          auth, c.update);
router.delete('/:id/steps/:stepId',       auth, c.destroy);
router.patch('/:id/steps/reorder',        auth, c.reorder);

module.exports = router;
