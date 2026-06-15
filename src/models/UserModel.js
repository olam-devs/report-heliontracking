const db = require('../config/db');

const parseJson = (v) => {
  if (!v) return null;
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return null; }
};

const toRow = (row) => row ? {
  ...row,
  is_active:             !!row.is_active,
  can_edit_reports:      !!row.can_edit_reports,
  can_view_tracking:     !!row.can_view_tracking,
  can_create_cases:      !!row.can_create_cases,
  can_edit_cases:        !!row.can_edit_cases,
  can_download_evidence: !!row.can_download_evidence,
  case_access:          parseJson(row.case_access),
  driver_access:        parseJson(row.driver_access),
  case_specific_access: parseJson(row.case_specific_access),
  tracking_page_access: parseJson(row.tracking_page_access),
} : null;

const COLS = 'id, name, email, role, is_active, can_edit_reports, can_view_tracking, can_create_cases, can_edit_cases, can_download_evidence, case_access, driver_access, case_specific_access, tracking_page_access, created_at';

exports.findAll = async () => {
  const [rows] = await db.query(`SELECT ${COLS} FROM users ORDER BY id ASC`);
  return rows.map(toRow);
};

exports.findByEmail = async (email) => {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] ? toRow(rows[0]) : null;
};

exports.findById = async (id) => {
  const [rows] = await db.query(`SELECT ${COLS} FROM users WHERE id = ?`, [id]);
  return rows[0] ? toRow(rows[0]) : null;
};

exports.create = async ({ name, email, password, role = 'reporter', is_active = true, can_edit_reports = false, can_view_tracking = false, can_create_cases = true, can_edit_cases = true, can_download_evidence = true, case_access = null, driver_access = null, case_specific_access = null, tracking_page_access = null }) => {
  const [result] = await db.query(
    'INSERT INTO users (name, email, password, role, is_active, can_edit_reports, can_view_tracking, can_create_cases, can_edit_cases, can_download_evidence, case_access, driver_access, case_specific_access, tracking_page_access) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      name, email, password, role, is_active ? 1 : 0, can_edit_reports ? 1 : 0,
      can_view_tracking ? 1 : 0,
      can_create_cases ? 1 : 0, can_edit_cases ? 1 : 0, can_download_evidence ? 1 : 0,
      case_access          ? JSON.stringify(case_access)          : null,
      driver_access        ? JSON.stringify(driver_access)        : null,
      case_specific_access ? JSON.stringify(case_specific_access) : null,
      tracking_page_access ? JSON.stringify(tracking_page_access) : null,
    ]
  );
  return result.insertId;
};

exports.update = async (id, fields) => {
  const allowed = ['name', 'email', 'role', 'is_active', 'can_edit_reports', 'can_view_tracking', 'can_create_cases', 'can_edit_cases', 'can_download_evidence', 'case_access', 'driver_access', 'case_specific_access', 'tracking_page_access'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (!(key in fields)) continue;
    let val = fields[key];
    if (['is_active','can_edit_reports','can_view_tracking','can_create_cases','can_edit_cases','can_download_evidence'].includes(key)) val = val ? 1 : 0;
    if (['case_access', 'driver_access', 'case_specific_access', 'tracking_page_access'].includes(key)) {
      val = val && (typeof val === 'object' ? Object.keys(val).length > 0 : val.length > 0) ? JSON.stringify(val) : null;
    }
    updates.push(`${key} = ?`);
    params.push(val);
  }
  if (!updates.length) return;
  params.push(id);
  await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
};

exports.updatePassword = async (id, hashedPassword) => {
  await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
};

exports.delete = async (id) => {
  await db.query('DELETE FROM users WHERE id = ?', [id]);
};
