require('dotenv').config();
const db = require('./src/config/db');

async function run() {
  const conn = await db.getConnection();
  try {
    // Add hearing_date and hearing_notes to cases
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND COLUMN_NAME IN ('hearing_date','hearing_notes')`
    );
    const existing = cols.map(r => r.COLUMN_NAME);
    if (!existing.includes('hearing_date')) {
      await conn.query(`ALTER TABLE \`cases\` ADD COLUMN \`hearing_date\` DATE NULL`);
      console.log('cases.hearing_date OK');
    } else { console.log('cases.hearing_date already exists'); }
    if (!existing.includes('hearing_notes')) {
      await conn.query(`ALTER TABLE \`cases\` ADD COLUMN \`hearing_notes\` TEXT NULL`);
      console.log('cases.hearing_notes OK');
    } else { console.log('cases.hearing_notes already exists'); }
    console.log('Migration v11 complete');
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
