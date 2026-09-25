/**
 * Probe GPS blob tables for fuel sensor fields and sample readings.
 * Run on VPS: node scripts/probe_fuel_sensor.js
 */
const mysql = require('mysql2/promise');
const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

(async () => {
  const conn = await mysql.createConnection(DB);

  // Get SEMI fleet vehicles with IDs
  const [vehicles] = await conn.query(`
    SELECT vi.ID, vi.VehiIDNO
    FROM jt808_vehicle_info vi
    JOIN jt808_company_info co ON co.ID = vi.CompanyID
    WHERE co.ID = 3
    ORDER BY vi.VehiIDNO
  `);
  console.log('SEMI vehicles:', vehicles.map(v => `${v.VehiIDNO}(${v.ID})`).join(', '));

  // Check columns in GPS shard
  const [cols] = await conn.query('DESCRIBE jt808_vehicle_gps_1_202609');
  console.log('\n── GPS point columns ──');
  cols.forEach(c => console.log(' ', c.Field.padEnd(22), c.Type));

  // Sample GPS points for T887ERP (pick one with known trip Sep 2026)
  const probe = vehicles.find(v => v.VehiIDNO === 'T887ERP') || vehicles[0];
  console.log('\n── Sample GPS points for', probe.VehiIDNO, '──');
  const shards = ['jt808_vehicle_gps_1_202609','jt808_vehicle_gps_2_202609','jt808_vehicle_gps_3_202609','jt808_vehicle_gps_4_202609'];
  for (const shard of shards) {
    const [pts] = await conn.query(
      `SELECT * FROM ${shard} WHERE VehiID = ? AND GPSTime >= '2026-09-14 00:00:00' AND GPSTime <= '2026-09-16 23:59:59' ORDER BY GPSTime LIMIT 5`,
      [probe.ID]
    ).catch(() => [[]]);
    if (pts.length) {
      console.log(`  from ${shard} (${pts.length} rows):`);
      pts.forEach(r => {
        const fuel = Object.entries(r).filter(([k]) => /fuel|oil|you|liang|analog|f1|f2|ad/i.test(k));
        console.log(`    ${String(r.GPSTime).slice(0,19)}  lat=${r.Lat}  lng=${r.Lng}  speed=${r.Speed}`);
        if (fuel.length) fuel.forEach(([k, v]) => console.log(`      ${k}=${v}`));
        else console.log('      [no fuel fields found]');
      });
      break;
    }
  }

  // Also check if there is a fuel sensor table
  const [tables] = await conn.query(`SHOW TABLES LIKE '%fuel%'`);
  console.log('\n── Tables matching *fuel*:', tables.map(t => Object.values(t)[0]).join(', ') || 'none');

  const [tables2] = await conn.query(`SHOW TABLES LIKE '%sensor%'`);
  console.log('── Tables matching *sensor*:', tables2.map(t => Object.values(t)[0]).join(', ') || 'none');

  // Check jt808_vehicle_info for any fuel/tank capacity columns
  const [infoCols] = await conn.query('DESCRIBE jt808_vehicle_info');
  const fuelCols = infoCols.filter(c => /fuel|tank|oil|you|liang/i.test(c.Field));
  if (fuelCols.length) {
    console.log('\n── Fuel-related columns in jt808_vehicle_info:');
    fuelCols.forEach(c => console.log(' ', c.Field, c.Type));
    const [infoRows] = await conn.query(
      `SELECT vi.VehiIDNO, ${fuelCols.map(c => 'vi.'+c.Field).join(', ')} FROM jt808_vehicle_info vi JOIN jt808_company_info co ON co.ID = vi.CompanyID WHERE co.ID = 3 LIMIT 10`
    );
    infoRows.forEach(r => console.log(' ', JSON.stringify(r)));
  }

  await conn.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
