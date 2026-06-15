const db = require('../config/db');

exports.findAll = async ({ status, severity, search, driver_id, allowedStatuses, allowedDriverIds, allowedCaseIds } = {}) => {
  let sql = `
    SELECT c.*, u.name AS created_by_name,
      (SELECT GROUP_CONCAT(d.name ORDER BY d.name SEPARATOR ', ')
       FROM case_drivers cd JOIN drivers d ON cd.driver_id = d.id
       WHERE cd.case_id = c.id) AS driver_names
    FROM cases c
    LEFT JOIN users u ON c.created_by = u.id
    WHERE 1=1`;
  const params = [];

  if (allowedCaseIds && allowedCaseIds.length) {
    sql += ` AND c.id IN (${allowedCaseIds.map(() => '?').join(',')})`;
    params.push(...allowedCaseIds);
  } else {
    if (driver_id) {
      sql += ` AND EXISTS (SELECT 1 FROM case_drivers cd WHERE cd.case_id = c.id AND cd.driver_id = ?)`;
      params.push(driver_id);
    }
    if (allowedDriverIds && allowedDriverIds.length) {
      sql += ` AND EXISTS (SELECT 1 FROM case_drivers cd WHERE cd.case_id = c.id AND cd.driver_id IN (${allowedDriverIds.map(() => '?').join(',')}))`;
      params.push(...allowedDriverIds);
    }
  }

  if (status)   { sql += ' AND c.status = ?';   params.push(status); }
  if (severity) { sql += ' AND c.severity = ?'; params.push(severity); }
  if (search) {
    sql += ` AND (c.vehicle_plate LIKE ? OR c.title LIKE ?
      OR EXISTS (SELECT 1 FROM case_drivers cd JOIN drivers d ON cd.driver_id = d.id WHERE cd.case_id = c.id AND d.name LIKE ?))`;
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (allowedStatuses && allowedStatuses.length) {
    sql += ` AND c.status IN (${allowedStatuses.map(() => '?').join(',')})`;
    params.push(...allowedStatuses);
  }

  sql += ' ORDER BY c.created_at DESC';
  const [rows] = await db.query(sql, params);
  return rows;
};

exports.findById = async (id) => {
  const [rows] = await db.query(
    `SELECT c.*, u.name AS created_by_name
     FROM cases c LEFT JOIN users u ON c.created_by = u.id WHERE c.id = ?`,
    [id]
  );
  if (!rows[0]) return null;
  const [drivers] = await db.query(
    `SELECT d.* FROM drivers d
     JOIN case_drivers cd ON d.id = cd.driver_id
     WHERE cd.case_id = ? ORDER BY d.name`,
    [id]
  );
  return { ...rows[0], drivers };
};

exports.create = async ({ id, title, vehicle_plate, driver_name, incident_date, status = 'ongoing', severity = 'medium', created_by }) => {
  await db.query(
    'INSERT INTO cases (id, title, vehicle_plate, driver_name, incident_date, status, severity, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, title, vehicle_plate || null, driver_name || null, incident_date || null, status, severity, created_by]
  );
  return id;
};

exports.update = async (id, fields) => {
  const allowed = ['title', 'vehicle_plate', 'driver_name', 'incident_date', 'status', 'severity'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      params.push(fields[key]);
    }
  }
  if (!updates.length) return;
  params.push(id);
  await db.query(`UPDATE cases SET ${updates.join(', ')} WHERE id = ?`, params);
};

exports.delete = async (id) => {
  await db.query('DELETE FROM cases WHERE id = ?', [id]);
};

exports.getNextId = async () => {
  const [rows] = await db.query("SELECT id FROM cases WHERE id LIKE 'INC-%' ORDER BY id DESC LIMIT 1");
  if (!rows.length) return 'INC-001';
  const last = parseInt(rows[0].id.replace('INC-', ''), 10);
  return `INC-${String(last + 1).padStart(3, '0')}`;
};

exports.linkDriver = async (caseId, driverId) => {
  await db.query(
    'INSERT IGNORE INTO case_drivers (case_id, driver_id) VALUES (?, ?)',
    [caseId, driverId]
  );
};

exports.unlinkDriver = async (caseId, driverId) => {
  await db.query(
    'DELETE FROM case_drivers WHERE case_id = ? AND driver_id = ?',
    [caseId, driverId]
  );
};

exports.getLinkedDrivers = async (caseId) => {
  const [rows] = await db.query(
    `SELECT d.* FROM drivers d
     JOIN case_drivers cd ON d.id = cd.driver_id
     WHERE cd.case_id = ? ORDER BY d.name`,
    [caseId]
  );
  return rows;
};
