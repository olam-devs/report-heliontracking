const db = require('../config/db');

exports.findByStepId = async (stepId) => {
  const [rows] = await db.query(
    'SELECT * FROM evidence_files WHERE step_id = ? ORDER BY uploaded_at ASC',
    [stepId]
  );
  return rows;
};

exports.findByCaseId = async (caseId) => {
  const [rows] = await db.query(
    'SELECT * FROM evidence_files WHERE case_id = ? AND step_id IS NULL ORDER BY uploaded_at ASC',
    [caseId]
  );
  return rows;
};

exports.findById = async (id) => {
  const [rows] = await db.query('SELECT * FROM evidence_files WHERE id = ?', [id]);
  return rows[0] || null;
};

exports.create = async ({ step_id, case_id, file_name, file_path, file_type, mime_type, file_size, description }) => {
  const [result] = await db.query(
    'INSERT INTO evidence_files (step_id, case_id, file_name, file_path, file_type, mime_type, file_size, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [step_id || null, case_id || null, file_name, file_path, file_type, mime_type, file_size, description || null]
  );
  return result.insertId;
};

exports.update = async (id, { description }) => {
  await db.query('UPDATE evidence_files SET description = ? WHERE id = ?', [description, id]);
};

exports.delete = async (id) => {
  await db.query('DELETE FROM evidence_files WHERE id = ?', [id]);
};

const detectFileType = (mime) => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
};

exports.detectFileType = detectFileType;
