/**
 * Find where CMSV6 stores per-point fuel sensor readings.
 * The GPS blob has no moving positions and no changing fuel field,
 * so fuel must be in a separate table (like jt808_vehicle_oil_X_YYYYMM
 * or a realtime fuel log).
 *
 * Run on VPS: node scripts/probe_fuel_log_tables.js
 */
const mysql = require('mysql2/promise');
const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

(async () => {
  const conn = await mysql.createConnection(DB);

  // 1. All tables in 1010GPS
  const [tables] = await conn.query('SHOW TABLES');
  const allTables = tables.map(t => Object.values(t)[0]);
  console.log(`Total tables: ${allTables.length}`);
  console.log('All tables:');
  allTables.forEach(t => console.log(' ', t));

  // 2. Look for tables that might hold per-point fuel/oil data
  const fuelTables = allTables.filter(t =>
    /oil|fuel|you|liang|sensor|realtime|real_time|rt|analog|adc/i.test(t) && t !== 'dev_youliang'
  );
  console.log('\n── Fuel/oil-related tables:', fuelTables.length, '──');
  for (const t of fuelTables) {
    const [cols] = await conn.query(`DESCRIBE ${t}`).catch(() => [[]]);
    const [cnt] = await conn.query(`SELECT COUNT(*) AS n FROM ${t}`).catch(() => [[{n:0}]]);
    console.log(`\n${t} (${cnt[0].n} rows):`);
    cols.forEach(c => console.log('  ', c.Field.padEnd(25), c.Type));
  }

  // 3. Look for shard-pattern tables we might have missed (e.g. jt808_vehicle_oil_X_YYYYMM)
  const oilShards = allTables.filter(t => /oil|liang/i.test(t));
  console.log('\n── Oil/liang shard tables:', oilShards.join(', ') || 'none');

  // 4. Check if jt808_vehicle_gps actually has more columns than we think
  const [gpsCols] = await conn.query('DESCRIBE jt808_vehicle_gps_3_202609').catch(() => [[]]);
  console.log('\n── jt808_vehicle_gps_3_202609 columns:');
  gpsCols.forEach(c => console.log('  ', c.Field.padEnd(25), c.Type));

  // 5. Sample a GPS row — what does a non-blob row look like (any non-mediumblob col)?
  const [sampleRow] = await conn.query(
    `SELECT VehiID, GPSDate, LENGTH(GPSData) AS blobLen FROM jt808_vehicle_gps_3_202609
     WHERE VehiID = 51 AND GPSDate = '2026-09-21' LIMIT 1`
  ).catch(() => [[]]);
  console.log('\n── Sample GPS row (T887ERP Sep21):', JSON.stringify(sampleRow[0]));

  // 6. Check if there's a separate table for realtime/minutely data
  const rtTables = allTables.filter(t => /realtime|real|minute|hourly|interval/i.test(t));
  console.log('\n── Realtime/interval tables:', rtTables.join(', ') || 'none');

  // 7. Check other databases on the server for fuel data
  const [dbs] = await conn.query('SHOW DATABASES').catch(() => [[]]);
  console.log('\n── All databases:');
  dbs.forEach(d => console.log(' ', Object.values(d)[0]));

  // 8. Look at dev_youliang more carefully — does it have per-day or per-event readings?
  console.log('\n── dev_youliang DESCRIBE:');
  const [dyc] = await conn.query('DESCRIBE dev_youliang').catch(() => [[]]);
  dyc.forEach(c => console.log('  ', c.Field.padEnd(25), c.Type));
  const [dyRows] = await conn.query(
    `SELECT * FROM dev_youliang WHERE VehiID = 51 ORDER BY RecordTime DESC LIMIT 5`
  ).catch(async () => {
    const [r2] = await conn.query(`SELECT * FROM dev_youliang LIMIT 5`).catch(()=>[[]]);
    return [r2];
  });
  console.log('  Sample rows:');
  dyRows.forEach(r => console.log('  ', JSON.stringify(r)));

  await conn.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
