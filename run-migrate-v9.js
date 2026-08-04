const mysql = require('mysql2/promise');
require('dotenv').config();
async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'fleet_incidents',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    multipleStatements: true,
  });
  await conn.query(`ALTER TABLE mechanic_logs ADD COLUMN IF NOT EXISTS seen_by_admin TINYINT(1) NOT NULL DEFAULT 0`);
  console.log('mechanic_logs.seen_by_admin OK');
  await conn.query(`ALTER TABLE mechanic_admin_notes ADD COLUMN IF NOT EXISTS seen_by_mechanic TINYINT(1) NOT NULL DEFAULT 0`);
  console.log('mechanic_admin_notes.seen_by_mechanic OK');
  await conn.end();
  console.log('Migration v9 complete.');
}
main().catch(e => { console.error(e.message); process.exit(1); });
