/**
 * Probe jt808_vehicle_daily columns and sample odometer values for SEMI fleet
 */
const mysql = require('mysql2/promise');

const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

(async () => {
  const conn = await mysql.createConnection(DB);

  // Show all columns in the daily table
  const [cols] = await conn.query(`DESCRIBE jt808_vehicle_daily`);
  console.log('\n── jt808_vehicle_daily columns ──');
  cols.forEach(c => console.log(`  ${c.Field.padEnd(20)} ${c.Type}`));

  // Sample 10 rows for SEMI fleet to see odometer values
  const [rows] = await conn.query(`
    SELECT vd.*, vi.VehiIDNO
    FROM jt808_vehicle_daily vd
    JOIN jt808_vehicle_info vi ON vi.ID = vd.VehiID
    JOIN jt808_company_info co ON co.ID = vi.CompanyID
    WHERE co.ID = 3
      AND vd.GPSDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    LIMIT 10`);

  console.log('\n── Sample rows (all numeric fields) ──');
  if (rows.length) {
    const numericFields = cols.filter(c => c.Type.includes('int') || c.Type.includes('float') || c.Type.includes('double') || c.Type.includes('decimal'));
    rows.forEach(r => {
      console.log(`\n  ${r.VehiIDNO}  ${r.GPSDate}`);
      numericFields.forEach(c => {
        if (r[c.Field] != null && r[c.Field] !== 0)
          console.log(`    ${c.Field.padEnd(20)} = ${r[c.Field]}`);
      });
    });
  }

  await conn.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
