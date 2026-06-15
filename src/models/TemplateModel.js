const db = require('../config/db');

exports.findAll = async () => {
  const [rows] = await db.query(
    'SELECT t.*, u.name AS created_by_name FROM templates t LEFT JOIN users u ON t.created_by = u.id ORDER BY t.created_at DESC'
  );
  return rows;
};

exports.findById = async (id) => {
  const [rows] = await db.query(
    'SELECT t.*, u.name AS created_by_name FROM templates t LEFT JOIN users u ON t.created_by = u.id WHERE t.id = ?',
    [id]
  );
  return rows[0] || null;
};

exports.create = async ({ name, language, sections, created_by }) => {
  const [result] = await db.query(
    'INSERT INTO templates (name, language, sections, created_by) VALUES (?, ?, ?, ?)',
    [name, language, JSON.stringify(sections), created_by]
  );
  return result.insertId;
};

exports.update = async (id, { name, language, sections }) => {
  await db.query(
    'UPDATE templates SET name = ?, language = ?, sections = ? WHERE id = ?',
    [name, language, JSON.stringify(sections), id]
  );
};

exports.delete = async (id) => {
  await db.query('DELETE FROM templates WHERE id = ?', [id]);
};
