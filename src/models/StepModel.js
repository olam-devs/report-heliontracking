const db = require('../config/db');

exports.findByCaseId = async (caseId) => {
  const [rows] = await db.query(
    'SELECT * FROM steps WHERE case_id = ? ORDER BY step_order ASC',
    [caseId]
  );
  return rows;
};

exports.findById = async (id) => {
  const [rows] = await db.query('SELECT * FROM steps WHERE id = ?', [id]);
  return rows[0] || null;
};

exports.create = async ({ case_id, step_order, type, label, content, note }) => {
  const [result] = await db.query(
    'INSERT INTO steps (case_id, step_order, type, label, content, note) VALUES (?, ?, ?, ?, ?, ?)',
    [case_id, step_order, type, label || '', content || null, note || null]
  );
  return result.insertId;
};

exports.update = async (id, { label, content, note }) => {
  await db.query(
    'UPDATE steps SET label = ?, content = ?, note = ? WHERE id = ?',
    [label, content, note, id]
  );
};

exports.delete = async (id) => {
  await db.query('DELETE FROM steps WHERE id = ?', [id]);
};

exports.getMaxOrder = async (caseId) => {
  const [rows] = await db.query(
    'SELECT COALESCE(MAX(step_order), 0) AS max_order FROM steps WHERE case_id = ?',
    [caseId]
  );
  return rows[0].max_order;
};

exports.reorder = async (caseId, orderedIds) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < orderedIds.length; i++) {
      await conn.query(
        'UPDATE steps SET step_order = ? WHERE id = ? AND case_id = ?',
        [i + 1, orderedIds[i], caseId]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
