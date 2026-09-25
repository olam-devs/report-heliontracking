/**
 * Probe GPS blob binary format to locate fuel sensor field offset.
 * Cross-references blob field values with known daily startFuelL/endFuelL.
 * Run on VPS: node scripts/probe_gps_blob.js
 *
 * The 72-byte record in parseGPSBlob currently extracts:
 *   off 40 → lng (Int32LE ÷ 1e6)
 *   off 44 → lat (Int32LE ÷ 1e6)
 *
 * We need to find the fuel resistance field offset and decode it via
 * the dev_youliang calibration table.
 */
const mysql = require('mysql2/promise');
const DB = { host: '127.0.0.1', port: 3311, user: 'root', password: 'cmsserverv6', database: '1010GPS' };

// SEMI fleet fuel calibration (from dev_youliang — all devices identical)
const CALIB_R = [2792,  6756, 12000, 14592, 19694, 24792, 29923, 35144, 40710];
const CALIB_L = [  20,    80,   160,   200,   280,   360,   440,   520,   600];

function resistanceToLitres(r) {
  if (r <= CALIB_R[0]) return CALIB_L[0];
  if (r >= CALIB_R[CALIB_R.length - 1]) return CALIB_L[CALIB_L.length - 1];
  for (let i = 0; i < CALIB_R.length - 1; i++) {
    if (r >= CALIB_R[i] && r <= CALIB_R[i + 1]) {
      const t = (r - CALIB_R[i]) / (CALIB_R[i + 1] - CALIB_R[i]);
      return CALIB_L[i] + t * (CALIB_L[i + 1] - CALIB_L[i]);
    }
  }
  return null;
}

(async () => {
  const conn = await mysql.createConnection(DB);

  // Get T887ERP
  const [vehicles] = await conn.query(`
    SELECT vi.ID, vi.VehiIDNO FROM jt808_vehicle_info vi
    JOIN jt808_company_info co ON co.ID = vi.CompanyID
    WHERE co.ID = 3 AND vi.VehiIDNO = 'T887ERP'
  `);
  if (!vehicles.length) { console.log('T887ERP not found'); await conn.end(); return; }
  const v = vehicles[0];
  console.log(`Probing ${v.VehiIDNO} (ID=${v.ID})`);

  // Get daily fuel for reference (known good values with signed cast)
  const [daily] = await conn.query(`
    SELECT GPSDate,
           CAST(SYouLiang AS SIGNED)/100 AS startL,
           CAST(EYouLiang AS SIGNED)/100 AS endL
    FROM jt808_vehicle_daily
    WHERE VehiID = ? AND GPSDate BETWEEN '2026-09-18' AND '2026-09-24'
    ORDER BY GPSDate
  `, [v.ID]);
  console.log('\n── Daily fuel reference (signed cast) ──');
  daily.forEach(d => console.log(`  ${d.GPSDate}  start=${Number(d.startL).toFixed(2)}L  end=${Number(d.endL).toFixed(2)}L`));

  // Find the shard containing this vehicle for Sep 2026
  const shards = ['jt808_vehicle_gps_1_202609','jt808_vehicle_gps_2_202609',
                  'jt808_vehicle_gps_3_202609','jt808_vehicle_gps_4_202609'];
  let shard = null;
  for (const s of shards) {
    const [r] = await conn.query(`SELECT 1 FROM ${s} WHERE VehiID = ? LIMIT 1`, [v.ID]).catch(() => [[]]);
    if (r.length) { shard = s; break; }
  }
  if (!shard) { console.log('\nNo GPS shard found for Sep 2026'); await conn.end(); return; }
  console.log(`\nUsing shard: ${shard}`);

  // Fetch blobs for each day
  const testDates = ['2026-09-18', '2026-09-19', '2026-09-21', '2026-09-22', '2026-09-23'];
  for (const ds of testDates) {
    const [rows] = await conn.query(
      `SELECT GPSData FROM ${shard} WHERE VehiID = ? AND GPSDate = ? LIMIT 1`,
      [v.ID, ds]
    ).catch(() => [[]]);
    if (!rows.length || !rows[0].GPSData) { console.log(`\n${ds}: no blob`); continue; }

    const buf = Buffer.from(rows[0].GPSData);
    const RECORD = 72;
    const nRecs = Math.floor(buf.length / RECORD);
    console.log(`\n── ${ds}: blob=${buf.length}b, ${nRecs} records ──`);

    // Print first record raw hex
    console.log('  First record hex:', buf.slice(0, RECORD).toString('hex'));

    // Decode all records, try every 2-byte and 4-byte window as a potential fuel resistance
    // We expect fuel resistance 2792-40710 (within 600L calibration range)
    const refDaily = daily.find(d => String(d.GPSDate).slice(0,10) === ds);

    // Show field analysis of first 3 records
    const maxShow = Math.min(3, nRecs);
    for (let rec = 0; rec < maxShow; rec++) {
      const off = rec * RECORD;
      const lng = buf.readInt32LE(off + 40) / 1e6;
      const lat = buf.readInt32LE(off + 44) / 1e6;
      process.stdout.write(`  rec[${rec}] lat=${lat.toFixed(4)} lng=${lng.toFixed(4)} `);

      // Try all UInt16LE positions for fuel resistance value in range 2792-40710
      const candidates = [];
      for (let o = 0; o + 2 <= RECORD; o += 2) {
        const u16 = buf.readUInt16LE(off + o);
        if (u16 >= 2792 && u16 <= 40710) {
          const litres = resistanceToLitres(u16);
          if (refDaily) {
            const nearStart = Math.abs(litres - Number(refDaily.startL)) < 30;
            const nearEnd   = Math.abs(litres - Number(refDaily.endL)) < 30;
            if (nearStart || nearEnd) {
              candidates.push({ byte: o, u16, litres: litres.toFixed(1), nearStart, nearEnd });
            }
          } else {
            candidates.push({ byte: o, u16, litres: litres.toFixed(1) });
          }
        }
      }
      if (candidates.length) {
        console.log(`→ fuel candidates: ${candidates.map(c => `byte${c.byte}(${c.u16}→${c.litres}L${c.nearStart?' ≈start':''}${c.nearEnd?' ≈end':''})`).join(', ')}`);
      } else {
        console.log('→ no resistance match in calibration range');
      }
    }

    // Also print all UInt16 values at even offsets for manual inspection
    const rec0 = [];
    for (let o = 0; o + 2 <= RECORD; o += 2) {
      rec0.push(`[${o}]=${buf.readUInt16LE(o)}`);
    }
    console.log('  UInt16LE at all even offsets:', rec0.join('  '));
  }

  // If we found consistent candidate offsets, report them
  console.log('\n── Summary: check which byte offset consistently matches daily startL/endL above ──');

  await conn.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
