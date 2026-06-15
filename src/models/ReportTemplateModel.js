const db = require('../config/db');

exports.findAll = async () => {
  const [rows] = await db.query(
    `SELECT rt.*, u.name AS created_by_name
     FROM report_templates rt
     LEFT JOIN users u ON u.id = rt.created_by
     ORDER BY rt.is_default DESC, rt.created_at DESC`
  );
  return rows;
};

exports.findById = async (id) => {
  const [rows] = await db.query(
    `SELECT rt.*, u.name AS created_by_name
     FROM report_templates rt
     LEFT JOIN users u ON u.id = rt.created_by
     WHERE rt.id = ?`,
    [id]
  );
  return rows[0] || null;
};

exports.findDefault = async () => {
  const [rows] = await db.query(
    'SELECT * FROM report_templates WHERE is_default = 1 LIMIT 1'
  );
  return rows[0] || null;
};

exports.create = async ({ name, description, content, is_default = false, created_by }) => {
  if (is_default) {
    await db.query('UPDATE report_templates SET is_default = 0');
  }
  const [result] = await db.query(
    'INSERT INTO report_templates (name, description, content, is_default, created_by) VALUES (?, ?, ?, ?, ?)',
    [name, description || null, content || '', is_default ? 1 : 0, created_by || null]
  );
  return result.insertId;
};

exports.update = async (id, { name, description, content }) => {
  await db.query(
    'UPDATE report_templates SET name = ?, description = ?, content = ? WHERE id = ?',
    [name, description || null, content, id]
  );
};

exports.setDefault = async (id) => {
  await db.query('UPDATE report_templates SET is_default = 0');
  await db.query('UPDATE report_templates SET is_default = 1 WHERE id = ?', [id]);
};

exports.duplicate = async (id, created_by) => {
  const tpl = await exports.findById(id);
  if (!tpl) return null;
  const [result] = await db.query(
    'INSERT INTO report_templates (name, description, content, is_default, created_by) VALUES (?, ?, ?, 0, ?)',
    [`${tpl.name} (Copy)`, tpl.description, tpl.content, created_by || null]
  );
  return result.insertId;
};

exports.delete = async (id) => {
  await db.query('DELETE FROM report_templates WHERE id = ?', [id]);
};
