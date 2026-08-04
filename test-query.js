const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'fleet_incidents',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    dateStrings: true,
  });

  console.log('\n=== Raw log_date values (dateStrings:true) ===');
  const [raw] = await conn.query(
    `SELECT id, devIdno, plate, log_date, recorded_at FROM mechanic_logs ORDER BY id DESC LIMIT 10`
  );
  console.table(raw);

  console.log('\n=== BETWEEN 2026-07-29 AND 2026-08-04 ===');
  const [ranged] = await conn.query(
    `SELECT id, plate, log_date FROM mechanic_logs WHERE log_date BETWEEN ? AND ? ORDER BY log_date DESC`,
    ['2026-07-29', '2026-08-04']
  );
  console.log('Rows found:', ranged.length);
  console.table(ranged);

  console.log('\n=== ALL logs no filter ===');
  const [all] = await conn.query(`SELECT id, plate, log_date FROM mechanic_logs ORDER BY log_date DESC`);
  console.log('Total rows:', all.length);
  console.table(all);

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
