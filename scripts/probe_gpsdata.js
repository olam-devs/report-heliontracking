/**
 * Probe GPSData blob format in jt808_vehicle_gps_N_YYYYMM
 * Run on VPS: node probe_gpsdata.js
 */
const mysql = require('mysql2/promise');

const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

(async () => {
  const conn = await mysql.createConnection(DB);

  // 1. Data type of GPSData
  const [cols] = await conn.query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='1010GPS' AND TABLE_NAME='jt808_vehicle_gps_1_202609'
    ORDER BY ORDINAL_POSITION`);
  console.log('Columns:');
  cols.forEach(c => console.log(`  ${c.COLUMN_NAME.padEnd(15)} ${c.DATA_TYPE} len=${c.CHARACTER_MAXIMUM_LENGTH}`));

  // 2. Sample one row — hex + length
  const [rows] = await conn.query(`
    SELECT VehiID, GPSDate,
           LENGTH(GPSData) AS byteLen,
           HEX(SUBSTRING(GPSData,1,80)) AS hexHead,
           LEFT(CONVERT(GPSData USING utf8mb4), 300) AS textHead
    FROM jt808_vehicle_gps_1_202609
    WHERE GPSData IS NOT NULL AND LENGTH(GPSData) > 10
    LIMIT 3`);

  for (const r of rows) {
    console.log(`\nVehiID=${r.VehiID} GPSDate=${r.GPSDate} bytes=${r.byteLen}`);
    console.log(`  hexHead: ${r.hexHead}`);
    console.log(`  textHead: ${r.textHead}`);
  }

  // 3. Try JSON parse to confirm
  const [jrows] = await conn.query(`
    SELECT VehiID, GPSDate, CONVERT(GPSData USING utf8mb4) AS json_str
    FROM jt808_vehicle_gps_1_202609
    WHERE GPSData IS NOT NULL AND LENGTH(GPSData) > 10
    LIMIT 1`);
  if (jrows[0]) {
    try {
      const parsed = JSON.parse(jrows[0].json_str);
      console.log('\nJSON parse succeeded! Type:', typeof parsed, Array.isArray(parsed) ? `array[${parsed.length}]` : '');
      if (Array.isArray(parsed) && parsed[0]) {
        console.log('First item keys:', Object.keys(parsed[0]).join(', '));
        console.log('First item:', JSON.stringify(parsed[0]));
      }
    } catch(e) {
      console.log('\nNot JSON:', e.message.slice(0,80));
    }
  }

  await conn.end();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
