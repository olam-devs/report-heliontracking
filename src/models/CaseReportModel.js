const db = require('../config/db');

exports.findByCaseId = async (caseId) => {
  const [rows] = await db.query(
    `SELECT cr.*,
            uc.name AS created_by_name,
            up.name AS published_by_name
     FROM case_reports cr
     LEFT JOIN users uc ON uc.id = cr.created_by
     LEFT JOIN users up ON up.id = cr.published_by
     WHERE cr.case_id = ?`,
    [caseId]
  );
  return rows[0] || null;
};

exports.create = async ({ case_id, template_id, content, created_by }) => {
  const [result] = await db.query(
    'INSERT INTO case_reports (case_id, template_id, content, status, created_by, updated_by) VALUES (?, ?, ?, "draft", ?, ?)',
    [case_id, template_id || null, content || '', created_by || null, created_by || null]
  );
  return result.insertId;
};

exports.saveDraft = async (caseId, { content, updated_by }) => {
  await db.query(
    'UPDATE case_reports SET content = ?, updated_by = ? WHERE case_id = ?',
    [content, updated_by || null, caseId]
  );
};

exports.publish = async (caseId, { published_by }) => {
  await db.query(
    `UPDATE case_reports
     SET status = 'published', published_by = ?, published_at = NOW()
     WHERE case_id = ?`,
    [published_by || null, caseId]
  );
};

exports.unpublish = async (caseId) => {
  await db.query(
    `UPDATE case_reports SET status = 'draft' WHERE case_id = ?`,
    [caseId]
  );
};
