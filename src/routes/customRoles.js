const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

router.get('/', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM custom_roles ORDER BY is_system DESC, name ASC');
  res.json(rows);
});

router.post('/', auth, auth.requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const slug = name.trim().toLowerCase().replace(/\s+/g, '_');
  try {
    const [r] = await db.query('INSERT INTO custom_roles (name) VALUES (?)', [slug]);
    res.status(201).json({ id: r.insertId, name: slug, is_system: 0 });
  } catch {
    res.status(409).json({ error: 'Role already exists' });
  }
});

router.delete('/:id', auth, auth.requireAdmin, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM custom_roles WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  if (rows[0].is_system) return res.status(403).json({ error: 'Cannot delete system role' });
  await db.query('DELETE FROM custom_roles WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
