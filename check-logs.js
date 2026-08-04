const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'fleet_incidents',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
  });

  console.log('\n=== mechanic_logs (all rows) ===');
  const [logs] = await conn.query(
    `SELECT ml.id, ml.mechanic_user_id, u.name, ml.devIdno, ml.plate, ml.log_date, ml.recorded_at, LEFT(ml.note,60) AS note
     FROM mechanic_logs ml JOIN users u ON u.id = ml.mechanic_user_id
     ORDER BY ml.recorded_at DESC`
  );
  if (logs.length === 0) {
    console.log('NO ROWS FOUND in mechanic_logs');
  } else {
    console.table(logs);
  }

  console.log('\n=== mechanic_attachments (all rows) ===');
  const [att] = await conn.query('SELECT * FROM mechanic_attachments ORDER BY uploaded_at DESC');
  if (att.length === 0) console.log('No attachments');
  else console.table(att);

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
