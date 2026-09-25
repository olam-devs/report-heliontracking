/**
 * Probe fuel time-series tables: dev_youliang, cb_trip_info, jt808_trip_info,
 * jt808_vehicle_info_expand
 * Run on VPS: node scripts/probe_fuel_timeseries.js
 */
const mysql = require('mysql2/promise');
const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

const fmt = (r) => JSON.stringify(r);

(async () => {
  const conn = await mysql.createConnection(DB);

  // Get SEMI vehicle IDs
  const [vehicles] = await conn.query(`
    SELECT vi.ID, vi.VehiIDNO FROM jt808_vehicle_info vi
    JOIN jt808_company_info co ON co.ID = vi.CompanyID
    WHERE co.ID = 3 ORDER BY vi.VehiIDNO
  `);
  const semiIds = vehicles.map(v => v.ID);
  const byId = Object.fromEntries(vehicles.map(v => [v.ID, v.VehiIDNO]));
  // Pick T887ERP for samples (has most trips)
  const t887 = vehicles.find(v => v.VehiIDNO === 'T887ERP');
  const t885 = vehicles.find(v => v.VehiIDNO === 'T885ERP');

  // ── 1. dev_youliang ───────────────────────────────────────────────────────────
  console.log('\n══ dev_youliang ══');
  const [dyc] = await conn.query('DESCRIBE dev_youliang').catch(() => [[]]);
  dyc.forEach(c => console.log(' ', c.Field.padEnd(22), c.Type));
  if (t887) {
    const [rows] = await conn.query(
      `SELECT * FROM dev_youliang WHERE VehiID = ? ORDER BY RecordTime DESC LIMIT 20`,
      [t887.ID]
    ).catch(async () => {
      // try without VehiID
      const [r2] = await conn.query(`SELECT * FROM dev_youliang LIMIT 10`).catch(() => [[]]);
      return [r2];
    });
    console.log('\n  T887ERP fuel readings (' + rows.length + '):');
    rows.forEach(r => console.log(' ', fmt({ ...r, plate: byId[r.VehiID] })));
  }

  // ── 2. jt808_vehicle_info_expand (calibration?) ───────────────────────────────
  console.log('\n══ jt808_vehicle_info_expand ══');
  const [ec] = await conn.query('DESCRIBE jt808_vehicle_info_expand').catch(() => [[]]);
  ec.forEach(c => console.log(' ', c.Field.padEnd(22), c.Type));
  const [erows] = await conn.query(
    `SELECT * FROM jt808_vehicle_info_expand WHERE VehiID IN (${semiIds.slice(0,5).join(',')}) LIMIT 10`
  ).catch(() => [[]]);
  erows.forEach(r => console.log(' ', fmt({ plate: byId[r.VehiID], ...r })));

  // ── 3. cb_trip_info (CMSV6 trip records) ─────────────────────────────────────
  console.log('\n══ cb_trip_info ══');
  const [tc] = await conn.query('DESCRIBE cb_trip_info').catch(() => [[]]);
  tc.forEach(c => console.log(' ', c.Field.padEnd(22), c.Type));
  if (t887) {
    const [rows] = await conn.query(
      `SELECT * FROM cb_trip_info WHERE VehiID = ? ORDER BY StartTime DESC LIMIT 5`,
      [t887.ID]
    ).catch(() => [[]]);
    console.log('\n  T887ERP recent trips (' + rows.length + '):');
    rows.forEach(r => console.log(' ', fmt(r)));
  }

  // ── 4. jt808_trip_info ───────────────────────────────────────────────────────
  console.log('\n══ jt808_trip_info ══');
  const [jc] = await conn.query('DESCRIBE jt808_trip_info').catch(() => [[]]);
  jc.forEach(c => console.log(' ', c.Field.padEnd(22), c.Type));
  if (t887) {
    const [rows] = await conn.query(
      `SELECT * FROM jt808_trip_info WHERE VehiID = ? ORDER BY TripDate DESC LIMIT 5`,
      [t887.ID]
    ).catch(() => [[]]);
    console.log('\n  T887ERP trips (' + rows.length + '):');
    rows.forEach(r => console.log(' ', fmt(r)));
  }

  // ── 5. jt808_vehicle_daily fuel with safe signed cast ─────────────────────────
  console.log('\n══ jt808_vehicle_daily — T887ERP last 15 days (signed cast) ══');
  if (t887) {
    const [rows] = await conn.query(`
      SELECT GPSDate,
             CAST(SYouLiang AS SIGNED)/100  AS startL,
             CAST(EYouLiang AS SIGNED)/100  AS endL,
             (CAST(EYouLiang AS SIGNED) - CAST(SYouLiang AS SIGNED))/100 AS deltaL,
             NoGps, DriveTime/3600 AS driveHrs, CalcIdelTime/3600 AS idleHrs,
             CAST(CalcRunYouHao AS SIGNED)/100  AS calcDriveL,
             CAST(CalcIdelYouhao AS SIGNED)/100 AS calcIdleL,
             SLiCheng/1000 AS startOdomKm, ELiCheng/1000 AS endOdomKm
      FROM jt808_vehicle_daily
      WHERE VehiID = ? AND GPSDate >= DATE_SUB(CURDATE(), INTERVAL 20 DAY)
      ORDER BY GPSDate DESC
    `, [t887.ID]);
    rows.forEach(r => console.log(' ', JSON.stringify(r)));
  }

  // ── 6. jt808_vehicle_daily fuel — T885ERP (another active vehicle) ───────────
  console.log('\n══ jt808_vehicle_daily — T885ERP last 15 days ══');
  if (t885) {
    const [rows] = await conn.query(`
      SELECT GPSDate,
             CAST(SYouLiang AS SIGNED)/100  AS startL,
             CAST(EYouLiang AS SIGNED)/100  AS endL,
             (CAST(EYouLiang AS SIGNED) - CAST(SYouLiang AS SIGNED))/100 AS deltaL,
             NoGps, DriveTime/3600 AS driveHrs,
             CAST(CalcRunYouHao AS SIGNED)/100  AS calcDriveL,
             CAST(CalcIdelYouhao AS SIGNED)/100 AS calcIdleL
      FROM jt808_vehicle_daily
      WHERE VehiID = ? AND GPSDate >= DATE_SUB(CURDATE(), INTERVAL 20 DAY)
      ORDER BY GPSDate DESC
    `, [t885.ID]);
    rows.forEach(r => console.log(' ', JSON.stringify(r)));
  }

  await conn.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
