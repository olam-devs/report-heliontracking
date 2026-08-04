require('dotenv').config();
const db = require('./src/config/db');

async function run() {
  const conn = await db.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mechanic_pending_vehicles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        devIdno VARCHAR(50) NOT NULL,
        plate VARCHAR(50),
        reason TEXT,
        marked_by INT,
        marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_devIdno (devIdno)
      )
    `);
    console.log('mechanic_pending_vehicles OK');
    console.log('Migration v10 complete');
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
