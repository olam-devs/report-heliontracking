const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/templatesController');

router.get('/',       auth, c.list);
router.post('/',      auth, c.create);
router.get('/:id',    auth, c.show);
router.put('/:id',    auth, c.update);
router.delete('/:id', auth, c.destroy);

module.exports = router;
