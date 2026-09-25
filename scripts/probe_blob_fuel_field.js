/**
 * Definitively find fuel field offset in GPS blob.
 *
 * Method: for each test day, get ALL blob records (not just 3).
 * Compare first record vs last record byte values.
 * The field where (last - first) ≈ expected_daily_fuel_change is the fuel field.
 *
 * Test days chosen for maximal fuel signal:
 *  Sep 18 T887ERP: startL=224.60, endL=151.39 → Δ = -73.21L  (pure consumption day)
 *  Sep 21 T887ERP: startL=67.70,  endL=329.87 → Δ = +262.17L (big refuel day)
 *  Sep 22 T887ERP: startL=329.87, endL=193.27 → Δ = -136.60L (pure consumption day)
 *
 * Run on VPS: node scripts/probe_blob_fuel_field.js
 */
const mysql = require('mysql2/promise');
const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

const CALIB_R = [2792,  6756, 12000, 14592, 19694, 24792, 29923, 35144, 40710];
const CALIB_L = [  20,    80,   160,   200,   280,   360,   440,   520,   600];

function rToL(r) {
  if (r <= CALIB_R[0]) return CALIB_L[0];
  if (r >= CALIB_R[CALIB_R.length-1]) return CALIB_L[CALIB_R.length-1];
  for (let i=0;i<CALIB_R.length-1;i++) {
    if (r >= CALIB_R[i] && r <= CALIB_R[i+1]) {
      const t = (r - CALIB_R[i]) / (CALIB_R[i+1] - CALIB_R[i]);
      return CALIB_L[i] + t * (CALIB_L[i+1] - CALIB_L[i]);
    }
  }
}

function lToR(l) {
  if (l <= CALIB_L[0]) return CALIB_R[0];
  if (l >= CALIB_L[CALIB_L.length-1]) return CALIB_R[CALIB_L.length-1];
  for (let i=0;i<CALIB_L.length-1;i++) {
    if (l >= CALIB_L[i] && l <= CALIB_L[i+1]) {
      const t = (l - CALIB_L[i]) / (CALIB_L[i+1] - CALIB_L[i]);
      return CALIB_R[i] + t * (CALIB_R[i+1] - CALIB_R[i]);
    }
  }
}

const RECORD = 72;

function allRecords(buf) {
  const recs = [];
  for (let off = 0; off + RECORD <= buf.length; off += RECORD) {
    const rec = [];
    for (let b = 0; b < RECORD; b++) rec.push(buf[off + b]);
    recs.push(rec);
  }
  return recs;
}

// Read UInt16LE at position p of a record byte array
const u16 = (rec, p) => rec[p] + rec[p+1] * 256;
const s32 = (rec, p) => {
  const v = rec[p] + rec[p+1]*256 + rec[p+2]*65536 + rec[p+3]*16777216;
  return v >= 2147483648 ? v - 4294967296 : v;
};

(async () => {
  const conn = await mysql.createConnection(DB);

  const [vehicles] = await conn.query(`
    SELECT vi.ID, vi.VehiIDNO FROM jt808_vehicle_info vi
    JOIN jt808_company_info co ON co.ID = vi.CompanyID WHERE co.ID=3 AND vi.VehiIDNO='T887ERP'
  `);
  const v = vehicles[0];
  console.log(`Vehicle: ${v.VehiIDNO} ID=${v.ID}`);

  // Known daily fuel (signed cast verified)
  const testDays = [
    { ds:'2026-09-18', startL:224.60, endL:151.39, delta:-73.21, label:'pure consumption' },
    { ds:'2026-09-21', startL:67.70,  endL:329.87, delta:262.17, label:'big refuel' },
    { ds:'2026-09-22', startL:329.87, endL:193.27, delta:-136.60, label:'pure consumption 2' },
    { ds:'2026-09-23', startL:193.25, endL:291.73, delta:98.48,  label:'refuel+drive' },
  ];

  const shard = 'jt808_vehicle_gps_3_202609';

  // For each field position, track: does (last_val - first_val) track with delta_L?
  // Collect per-day per-position data
  const fieldData = {}; // position -> [{day, expected_delta_R, actual_delta_u16, actual_delta_s32}]

  for (const test of testDays) {
    const [rows] = await conn.query(
      `SELECT GPSData FROM ${shard} WHERE VehiID=? AND GPSDate=? LIMIT 1`,
      [v.ID, test.ds]
    ).catch(()=>[[]]);
    if (!rows.length || !rows[0].GPSData) { console.log(`No blob for ${test.ds}`); continue; }

    const buf = Buffer.from(rows[0].GPSData);
    const recs = allRecords(buf);
    // Filter out null records (lat=0, lng=0)
    const validRecs = recs.filter(r => {
      const lng = s32(r, 40) / 1e6;
      const lat = s32(r, 44) / 1e6;
      return Math.abs(lat) > 0.01 && Math.abs(lng) > 0.01;
    });

    if (validRecs.length < 2) { console.log(`Only ${validRecs.length} valid records for ${test.ds}`); continue; }

    const first = validRecs[0];
    const last  = validRecs[validRecs.length - 1];
    const expectedResistanceDelta = lToR(test.endL) - lToR(test.startL);

    console.log(`\n── ${test.ds} (${test.label}): ${validRecs.length} valid records ──`);
    console.log(`  Expected fuel: ${test.startL}L → ${test.endL}L (Δ=${test.delta}L)`);
    console.log(`  Expected resistance delta: ${expectedResistanceDelta.toFixed(0)}`);
    console.log(`  First record lat/lng: ${(s32(first,44)/1e6).toFixed(4)}, ${(s32(first,40)/1e6).toFixed(4)}`);
    console.log(`  Last  record lat/lng: ${(s32(last,44)/1e6).toFixed(4)}, ${(s32(last,40)/1e6).toFixed(4)}`);

    // Check every 2-byte position for UInt16 delta matching expected
    const candidates = [];
    for (let p = 0; p + 1 < RECORD; p += 1) {
      if (p >= 38 && p <= 49) continue; // skip lat/lng fields
      const firstVal = u16(first, p);
      const lastVal  = u16(last,  p);
      const actualDelta = lastVal - firstVal;

      // Does this delta scale to the expected fuel delta?
      // Try: if field is raw resistance
      if (firstVal >= 2792 && firstVal <= 40710 && lastVal >= 2792 && lastVal <= 40710) {
        const firstL = rToL(firstVal);
        const lastL  = rToL(lastVal);
        const fuelDelta = lastL - firstL;
        if (Math.abs(fuelDelta - test.delta) < 30) {
          candidates.push({ p, firstVal, lastVal, firstL:firstL.toFixed(1), lastL:lastL.toFixed(1), fuelDelta:fuelDelta.toFixed(1), match:'RESISTANCE' });
        }
      }
      // Try: if field is centilitres (÷100 = litres)
      if (firstVal > 500 && firstVal < 65000 && lastVal > 500 && lastVal < 65000) {
        const firstL = firstVal / 100;
        const lastL  = lastVal  / 100;
        const fuelDelta = lastL - firstL;
        if (Math.abs(fuelDelta - test.delta) < 30) {
          candidates.push({ p, firstVal, lastVal, firstL:firstL.toFixed(1), lastL:lastL.toFixed(1), fuelDelta:fuelDelta.toFixed(1), match:'CENTILITRES' });
        }
      }
      // Try: if field is decilitres (÷10 = litres)
      if (firstVal > 50 && firstVal < 6500 && lastVal > 50 && lastVal < 6500) {
        const firstL = firstVal / 10;
        const lastL  = lastVal  / 10;
        const fuelDelta = lastL - firstL;
        if (Math.abs(fuelDelta - test.delta) < 20) {
          candidates.push({ p, firstVal, lastVal, firstL:firstL.toFixed(1), lastL:lastL.toFixed(1), fuelDelta:fuelDelta.toFixed(1), match:'DECILITRES' });
        }
      }
      // Track for cross-day consistency
      if (!fieldData[p]) fieldData[p] = [];
      fieldData[p].push({ ds:test.ds, expectedDelta:test.delta, firstVal, lastVal, actualDelta });
    }

    if (candidates.length) {
      console.log('  FUEL FIELD CANDIDATES:');
      candidates.forEach(c => console.log(`    byte${c.p}: ${c.firstVal}→${c.lastVal} = ${c.firstL}L→${c.lastL}L (Δ=${c.fuelDelta}L) [${c.match}]`));
    } else {
      console.log('  No candidates matched. Showing top deltas:');
      // Show positions with biggest absolute delta
      const deltas = [];
      for (let p = 0; p+1 < RECORD; p++) {
        if (p >= 38 && p <= 49) continue;
        deltas.push({ p, d: Math.abs(u16(last,p) - u16(first,p)), firstVal:u16(first,p), lastVal:u16(last,p) });
      }
      deltas.sort((a,b) => b.d - a.d).slice(0,10).forEach(x =>
        console.log(`    byte${x.p}: ${x.firstVal}→${x.lastVal} (Δ=${x.lastVal-x.firstVal})`));
    }

    // Also show all positions as first-record values for this day
    console.log(`  First record all u16 values:`);
    const allU16 = [];
    for (let p=0;p+1<RECORD;p+=2) allU16.push(`[${p}]=${u16(first,p)}`);
    console.log('  ', allU16.join('  '));
    console.log(`  Last record all u16 values:`);
    const allU16L = [];
    for (let p=0;p+1<RECORD;p+=2) allU16L.push(`[${p}]=${u16(last,p)}`);
    console.log('  ', allU16L.join('  '));
  }

  // Cross-day consistency: find positions where actualDelta correlates with expectedDelta
  console.log('\n── Cross-day correlation (which byte position tracks fuel delta?) ──');
  const consistent = [];
  for (const [p, days] of Object.entries(fieldData)) {
    if (days.length < 3) continue;
    // Check: does actualDelta correlate with expectedDelta across days?
    // Simple check: sign matches on all days AND magnitude is proportional
    let allSignMatch = true;
    let allInRange = true;
    for (const d of days) {
      if (Math.sign(d.actualDelta) !== Math.sign(d.expectedDelta)) { allSignMatch = false; break; }
      // Ratio: actualDelta / expectedDelta should be roughly constant
      const ratio = d.actualDelta / d.expectedDelta;
      if (Math.abs(ratio) > 1000 || Math.abs(ratio) < 0.001) { allInRange = false; break; }
    }
    if (allSignMatch && allInRange) {
      const ratios = days.map(d => (d.actualDelta / d.expectedDelta).toFixed(2));
      consistent.push({ p: Number(p), ratios, days });
    }
  }
  if (consistent.length) {
    console.log('Positions with consistent sign + proportional delta:');
    consistent.sort((a,b)=>a.p-b.p).forEach(c => {
      console.log(`  byte${c.p}: ratios=${c.ratios.join(',')} (actualDeltas: ${c.days.map(d=>d.actualDelta).join(',')})`);
    });
  } else {
    console.log('No consistently correlated positions found.');
    console.log('\nShowing per-position actual deltas (day by day):');
    // Show the 4-day delta pattern for every position
    for (let p=0;p+1<RECORD;p+=2) {
      const days = fieldData[p] || [];
      if (days.length < 2) continue;
      const sames = days.filter(d=>d.actualDelta===0).length;
      if (sames === days.length) continue; // skip constant fields
      if (p>=38 && p<=49) continue;
      console.log(`  byte${String(p).padStart(2)}: ` +
        days.map(d=>`${d.ds}:Δ=${d.actualDelta}`).join('  ') +
        `  [expected: ${days.map(d=>`${d.expectedDelta.toFixed(0)}`).join(',')}]`
      );
    }
  }

  await conn.end();
})().catch(e=>{ console.error('❌', e.message); process.exit(1); });
