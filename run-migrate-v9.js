const mysql = require('mysql2/promise');
require('dotenv').config();

async function addColumnIfMissing(conn, table, column, definition) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (rows[0].cnt > 0) {
    console.log(`${table}.${column} already exists, skipping`);
    return;
  }
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`${table}.${column} OK`);
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'fleet_incidents',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
  });
  await addColumnIfMissing(conn, 'mechanic_logs', 'seen_by_admin', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing(conn, 'mechanic_admin_notes', 'seen_by_mechanic', 'TINYINT(1) NOT NULL DEFAULT 0');
  await conn.end();
  console.log('Migration v9 complete.');
}
main().catch(e => { console.error(e.message); process.exit(1); });
