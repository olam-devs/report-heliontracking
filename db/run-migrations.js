require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.DB_NAME || 'fleet_incidents', table, column],
  );
  return rows[0].c > 0;
}

async function main() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const seedPath = path.join(__dirname, 'seed.sql');
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASS || '';
  const database = process.env.DB_NAME || 'fleet_incidents';

  const root = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  if (fs.existsSync(schemaPath)) {
    await root.query(fs.readFileSync(schemaPath, 'utf8'));
    console.log('schema.sql applied');
  }
  await root.end();

  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });

  const migrations = ['migrate_v5.sql'];
  for (const file of migrations) {
    const fp = path.join(__dirname, file);
    if (!fs.existsSync(fp)) continue;
    const sql = fs.readFileSync(fp, 'utf8');
    try {
      await conn.query(sql);
      console.log(`${file} applied`);
    } catch (e) {
      if (/Duplicate column|already exists|Duplicate key/i.test(e.message)) {
        console.log(`${file} skipped (already applied)`);
      } else {
        throw e;
      }
    }
  }

  if (!(await columnExists(conn, 'users', 'can_view_tracking'))) {
    await conn.query(
      'ALTER TABLE users ADD COLUMN can_view_tracking TINYINT(1) NOT NULL DEFAULT 0',
    );
    console.log('can_view_tracking column added');
  } else {
    console.log('can_view_tracking already exists');
  }

  if (fs.existsSync(seedPath)) {
    try {
      await conn.query(fs.readFileSync(seedPath, 'utf8'));
      console.log('seed.sql applied');
    } catch (e) {
      if (/Duplicate entry/i.test(e.message)) console.log('seed skipped (data exists)');
      else throw e;
    }
  }

  await conn.query('UPDATE users SET can_view_tracking = 1 WHERE role = ?', ['admin']);
  console.log('admin users granted tracking access');

  await conn.end();
  console.log('Migration complete.');
}

main().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
