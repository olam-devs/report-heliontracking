const db = require('../config/db');

exports.findAll = async ({ search, allowedDriverIds } = {}) => {
  let sql = `SELECT d.*, u.name AS created_by_name,
    COUNT(DISTINCT cd.case_id) AS case_count
    FROM drivers d
    LEFT JOIN users u ON d.created_by = u.id
    LEFT JOIN case_drivers cd ON cd.driver_id = d.id
    WHERE 1=1`;
  const params = [];

  if (allowedDriverIds && allowedDriverIds.length) {
    sql += ` AND d.id IN (${allowedDriverIds.map(() => '?').join(',')})`;
    params.push(...allowedDriverIds);
  }
  if (search) {
    sql += ' AND (d.name LIKE ? OR d.vehicle_plate LIKE ? OR d.employee_id LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  sql += ' GROUP BY d.id ORDER BY d.name ASC';
  const [rows] = await db.query(sql, params);
  return rows;
};

exports.findById = async (id) => {
  const [rows] = await db.query(
    'SELECT d.*, u.name AS created_by_name FROM drivers d LEFT JOIN users u ON d.created_by = u.id WHERE d.id = ?',
    [id]
  );
  return rows[0] || null;
};

exports.create = async ({ name, vehicle_plate, employee_id, notes, created_by }) => {
  const [result] = await db.query(
    'INSERT INTO drivers (name, vehicle_plate, employee_id, notes, created_by) VALUES (?, ?, ?, ?, ?)',
    [name, vehicle_plate || null, employee_id || null, notes || null, created_by]
  );
  return result.insertId;
};

exports.update = async (id, { name, vehicle_plate, employee_id, notes }) => {
  const updates = [];
  const params = [];
  if (name !== undefined)          { updates.push('name = ?');          params.push(name); }
  if (vehicle_plate !== undefined) { updates.push('vehicle_plate = ?'); params.push(vehicle_plate); }
  if (employee_id !== undefined)   { updates.push('employee_id = ?');   params.push(employee_id); }
  if (notes !== undefined)         { updates.push('notes = ?');         params.push(notes); }
  if (!updates.length) return;
  params.push(id);
  await db.query(`UPDATE drivers SET ${updates.join(', ')} WHERE id = ?`, params);
};

exports.delete = async (id) => {
  await db.query('DELETE FROM drivers WHERE id = ?', [id]);
};
