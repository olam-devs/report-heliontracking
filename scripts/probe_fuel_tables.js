/**
 * Probe CMSV6 fuel card tables and refuel records for SEMI fleet
 * Run on VPS: node scripts/probe_fuel_tables.js
 */
const mysql = require('mysql2/promise');
const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

(async () => {
  const conn = await mysql.createConnection(DB);

  // Get SEMI vehicle IDs
  const [vehicles] = await conn.query(`
    SELECT vi.ID, vi.VehiIDNO
    FROM jt808_vehicle_info vi
    JOIN jt808_company_info co ON co.ID = vi.CompanyID
    WHERE co.ID = 3 ORDER BY vi.VehiIDNO
  `);
  const semiIds = vehicles.map(v => v.ID);
  const byId = Object.fromEntries(vehicles.map(v => [v.ID, v.VehiIDNO]));
  console.log('SEMI vehicle count:', vehicles.length);

  // ── 1. vm_refuel_info ─────────────────────────────────────────────────────────
  console.log('\n══ vm_refuel_info ══');
  const [rc] = await conn.query('DESCRIBE vm_refuel_info').catch(() => [[]]);
  if (rc.length) {
    rc.forEach(c => console.log(' ', c.Field.padEnd(22), c.Type));
    const [rows] = await conn.query(
      `SELECT * FROM vm_refuel_info WHERE VehiID IN (${semiIds.join(',')}) ORDER BY RefuelTime DESC LIMIT 20`
    ).catch(() => [[]]);
    console.log('\n  Latest refuel records (' + rows.length + '):');
    rows.forEach(r => console.log(' ', JSON.stringify({ ...r, plate: byId[r.VehiID] })));
  } else {
    console.log('  Table not accessible or empty');
  }

  // ── 2. vm_fuel_card_record ────────────────────────────────────────────────────
  console.log('\n══ vm_fuel_card_record ══');
  const [fc] = await conn.query('DESCRIBE vm_fuel_card_record').catch(() => [[]]);
  if (fc.length) {
    fc.forEach(c => console.log(' ', c.Field.padEnd(22), c.Type));
    const [rows] = await conn.query(
      `SELECT * FROM vm_fuel_card_record ORDER BY __EMPTY DESC LIMIT 10`
    ).catch(async () => {
      // Try without ordering by unknown col
      const [r2] = await conn.query(`SELECT * FROM vm_fuel_card_record LIMIT 10`).catch(() => [[]]);
      return [r2];
    });
    console.log('\n  Sample records (' + rows.length + '):');
    rows.slice(0, 5).forEach(r => console.log(' ', JSON.stringify(r)));
  } else {
    console.log('  Table not accessible');
  }

  // ── 3. vm_fuel_card_info ─────────────────────────────────────────────────────
  console.log('\n══ vm_fuel_card_info ══');
  const [fi] = await conn.query('DESCRIBE vm_fuel_card_info').catch(() => [[]]);
  if (fi.length) {
    fi.forEach(c => console.log(' ', c.Field.padEnd(22), c.Type));
    const [rows] = await conn.query(`SELECT * FROM vm_fuel_card_info LIMIT 10`).catch(() => [[]]);
    rows.slice(0, 5).forEach(r => console.log(' ', JSON.stringify(r)));
  } else {
    console.log('  Table not accessible');
  }

  // ── 4. Search for calibration tables anywhere in DB ───────────────────────────
  console.log('\n══ All tables in 1010GPS DB ══');
  const [tables] = await conn.query('SHOW TABLES');
  tables.forEach(t => console.log(' ', Object.values(t)[0]));

  // ── 5. Other databases on this server ────────────────────────────────────────
  console.log('\n══ All databases on server ══');
  const [dbs] = await conn.query('SHOW DATABASES').catch(() => [[]]);
  dbs.forEach(d => console.log(' ', Object.values(d)[0]));

  // ── 6. Check jt808_vehicle_daily for fuel sensor quality signals ──────────────
  console.log('\n══ Daily fuel sensor quality check (T887ERP last 10 days) ══');
  const t887 = vehicles.find(v => v.VehiIDNO === 'T887ERP');
  if (t887) {
    const [days] = await conn.query(`
      SELECT GPSDate, SYouLiang/100 AS startL, EYouLiang/100 AS endL,
             (EYouLiang - SYouLiang)/100 AS deltaL,
             NoGps, DriveTime, CalcIdelTime, SLiCheng, ELiCheng
      FROM jt808_vehicle_daily
      WHERE VehiID = ? AND GPSDate >= '2026-09-10'
      ORDER BY GPSDate DESC LIMIT 15
    `, [t887.ID]);
    days.forEach(d => console.log(' ', JSON.stringify(d)));
  }

  // ── 7. Try to decode one GPS blob to find fuel field ─────────────────────────
  console.log('\n══ GPS blob sample decode (T887ERP) ══');
  if (t887) {
    const shards = ['jt808_vehicle_gps_1_202609','jt808_vehicle_gps_2_202609',
                    'jt808_vehicle_gps_3_202609','jt808_vehicle_gps_4_202609'];
    for (const shard of shards) {
      const [pts] = await conn.query(
        `SELECT GPSDate, GPSData FROM ${shard} WHERE VehiID = ? AND GPSDate = '2026-09-15' LIMIT 1`,
        [t887.ID]
      ).catch(() => [[]]);
      if (pts.length && pts[0].GPSData) {
        const buf = Buffer.from(pts[0].GPSData);
        console.log(`  Blob from ${shard}: ${buf.length} bytes`);
        // Print first 100 bytes as hex for analysis
        console.log('  First 100 bytes (hex):', buf.slice(0, 100).toString('hex'));
        // Print as key=value if it looks like text
        const str = buf.toString('latin1');
        if (/[\x20-\x7E]{10}/.test(str)) console.log('  Text preview:', str.slice(0, 200));
        break;
      }
    }
  }

  await conn.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
