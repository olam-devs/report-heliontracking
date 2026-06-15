require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'fleet_incidents',
  });

  const db = process.env.DB_NAME || 'fleet_incidents';
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'can_view_tracking'`,
    [db],
  );

  if (!rows[0].c) {
    await conn.query(
      'ALTER TABLE users ADD COLUMN can_view_tracking TINYINT(1) NOT NULL DEFAULT 0',
    );
    console.log('can_view_tracking column added');
  } else {
    console.log('can_view_tracking already exists');
  }

  await conn.query("UPDATE users SET can_view_tracking = 1 WHERE role = 'admin'");
  console.log('admin tracking access granted');
  await conn.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
