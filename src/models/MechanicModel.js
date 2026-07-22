const db = require('../config/db');

const todayEnd = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

const nowStr = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const todayStr = () => new Date().toISOString().slice(0, 10);

// ── Access grants ────────────────────────────────────────────────────────────

exports.grantAccess = async ({ mechanic_user_id, devIdno, plate, can_see_status, granted_by }) => {
  const expires = todayEnd();
  const [r] = await db.query(
    `INSERT INTO mechanic_vehicle_access
       (mechanic_user_id, devIdno, plate, can_see_status, granted_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [mechanic_user_id, devIdno, plate, can_see_status ? 1 : 0, granted_by, expires]
  );
  return r.insertId;
};

exports.revokeAccess = async (id) => {
  await db.query(
    `UPDATE mechanic_vehicle_access SET revoked_at = ? WHERE id = ?`,
    [nowStr(), id]
  );
};

exports.getActiveAccessForMechanic = async (mechanic_user_id) => {
  const now = nowStr();
  const [rows] = await db.query(
    `SELECT mva.*, u.name AS granted_by_name
     FROM mechanic_vehicle_access mva
     JOIN users u ON u.id = mva.granted_by
     WHERE mva.mechanic_user_id = ?
       AND mva.revoked_at IS NULL
       AND mva.expires_at >= ?
     ORDER BY mva.granted_at DESC`,
    [mechanic_user_id, now]
  );
  return rows;
};

exports.getAllActiveAccess = async () => {
  const now = nowStr();
  const [rows] = await db.query(
    `SELECT mva.*, u.name AS mechanic_name, g.name AS granted_by_name
     FROM mechanic_vehicle_access mva
     JOIN users u ON u.id = mva.mechanic_user_id
     JOIN users g ON g.id = mva.granted_by
     WHERE mva.revoked_at IS NULL AND mva.expires_at >= ?
     ORDER BY mva.mechanic_user_id, mva.plate`,
    [now]
  );
  return rows;
};

exports.checkAccess = async (mechanic_user_id, devIdno) => {
  const now = nowStr();
  const [rows] = await db.query(
    `SELECT * FROM mechanic_vehicle_access
     WHERE mechanic_user_id = ? AND devIdno = ?
       AND revoked_at IS NULL AND expires_at >= ?
     LIMIT 1`,
    [mechanic_user_id, devIdno, now]
  );
  return rows[0] || null;
};

// ── Logs ─────────────────────────────────────────────────────────────────────

exports.createLog = async ({ mechanic_user_id, devIdno, plate, note, log_date }) => {
  const [r] = await db.query(
    `INSERT INTO mechanic_logs (mechanic_user_id, devIdno, plate, note, log_date)
     VALUES (?, ?, ?, ?, ?)`,
    [mechanic_user_id, devIdno, plate, note, log_date || todayStr()]
  );
  return r.insertId;
};

exports.getLogsForVehicle = async ({ mechanic_user_id, devIdno, date }) => {
  let sql = `SELECT ml.*, u.name AS mechanic_name FROM mechanic_logs ml
             JOIN users u ON u.id = ml.mechanic_user_id
             WHERE ml.devIdno = ?`;
  const params = [devIdno];
  if (mechanic_user_id) { sql += ' AND ml.mechanic_user_id = ?'; params.push(mechanic_user_id); }
  if (date) { sql += ' AND ml.log_date = ?'; params.push(date); }
  sql += ' ORDER BY ml.recorded_at DESC';
  const [rows] = await db.query(sql, params);
  return rows;
};

exports.getLogsForDate = async ({ date, mechanic_user_id, devIdno }) => {
  let sql = `SELECT ml.*, u.name AS mechanic_name FROM mechanic_logs ml
             JOIN users u ON u.id = ml.mechanic_user_id WHERE ml.log_date = ?`;
  const params = [date || todayStr()];
  if (mechanic_user_id) { sql += ' AND ml.mechanic_user_id = ?'; params.push(mechanic_user_id); }
  if (devIdno) { sql += ' AND ml.devIdno = ?'; params.push(devIdno); }
  sql += ' ORDER BY ml.recorded_at DESC';
  const [rows] = await db.query(sql, params);
  return rows;
};

exports.getLogById = async (id) => {
  const [rows] = await db.query('SELECT * FROM mechanic_logs WHERE id = ?', [id]);
  return rows[0] || null;
};

// ── Attachments ──────────────────────────────────────────────────────────────

exports.addAttachment = async ({ log_id, filename, original_name, mime_type }) => {
  const [r] = await db.query(
    `INSERT INTO mechanic_attachments (log_id, filename, original_name, mime_type)
     VALUES (?, ?, ?, ?)`,
    [log_id, filename, original_name, mime_type]
  );
  return r.insertId;
};

exports.getAttachmentsForLog = async (log_id) => {
  const [rows] = await db.query(
    'SELECT * FROM mechanic_attachments WHERE log_id = ? ORDER BY uploaded_at ASC',
    [log_id]
  );
  return rows;
};

exports.getAttachmentsForLogs = async (logIds) => {
  if (!logIds.length) return [];
  const [rows] = await db.query(
    `SELECT * FROM mechanic_attachments WHERE log_id IN (${logIds.map(() => '?').join(',')})`,
    logIds
  );
  return rows;
};

// ── Admin notes ──────────────────────────────────────────────────────────────

exports.addAdminNote = async ({ devIdno, plate, note, created_by }) => {
  const [r] = await db.query(
    `INSERT INTO mechanic_admin_notes (devIdno, plate, note, created_by) VALUES (?, ?, ?, ?)`,
    [devIdno, plate, note, created_by]
  );
  return r.insertId;
};

exports.deleteAdminNote = async (id) => {
  await db.query('DELETE FROM mechanic_admin_notes WHERE id = ?', [id]);
};

exports.getAdminNotes = async (devIdno) => {
  const [rows] = await db.query(
    `SELECT mn.*, u.name AS created_by_name
     FROM mechanic_admin_notes mn JOIN users u ON u.id = mn.created_by
     WHERE mn.devIdno = ? ORDER BY mn.created_at DESC`,
    [devIdno]
  );
  return rows;
};

exports.getAllAdminNotes = async () => {
  const [rows] = await db.query(
    `SELECT mn.*, u.name AS created_by_name
     FROM mechanic_admin_notes mn JOIN users u ON u.id = mn.created_by
     ORDER BY mn.devIdno, mn.created_at DESC`
  );
  return rows;
};

// ── Mechanics list ───────────────────────────────────────────────────────────

exports.getMechanics = async () => {
  const [rows] = await db.query(
    `SELECT id, name, email FROM users WHERE role = 'mechanic' AND is_active = 1 ORDER BY name`
  );
  return rows;
};
