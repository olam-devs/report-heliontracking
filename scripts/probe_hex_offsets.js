/**
 * Print raw hex of the first 144 bytes (2 × 72) of a GPS blob
 * to find where coordinates actually live.
 * Run on VPS: node scripts/probe_hex_offsets.js
 */
const mysql = require('mysql2/promise');
const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

function hexDump(buf, maxBytes = 144) {
  const len = Math.min(buf.length, maxBytes);
  for (let i = 0; i < len; i += 16) {
    const hex = [];
    for (let j = i; j < Math.min(i + 16, len); j++) {
      hex.push(buf[j].toString(16).padStart(2, '0').toUpperCase());
    }
    console.log(`  [${String(i).padStart(3)}]  ${hex.join(' ')}`);
  }
}

// Try every 4-byte aligned offset in first 144 bytes and show what int32 value it gives
function scanForCoords(buf, label) {
  console.log(`\n${label}  (blob=${buf.length}b)`);
  console.log('Searching for values near Tanzania (lat≈-7.0 lng≈39.3 → int32≈-7000000 and 39300000):');
  const len = Math.min(buf.length, 200);
  for (let off = 0; off + 4 <= len; off++) {
    const v = buf.readInt32LE(off);
    // Tanzania lat: -8000000 to -1000000
    // Tanzania lng: 38000000 to 41000000
    if ((v >= -8000000 && v <= -1000000) || (v >= 38000000 && v <= 41000000)) {
      console.log(`  offset ${String(off).padStart(3)}: ${v}  →  ${(v/1e6).toFixed(6)}  ← COORDS`);
    }
  }
}

(async () => {
  const conn = await mysql.createConnection(DB);

  // T887ERP Sep 16 — known to be near Vikindu (-7.014427, 39.307330)
  console.log('=== T887ERP Sep 16 (known: lat=-7.014427, lng=39.307330) ===');
  for (let n = 1; n <= 4; n++) {
    const [r] = await conn.query(
      `SELECT GPSData, LENGTH(GPSData) AS bytes FROM jt808_vehicle_gps_${n}_202609
       WHERE VehiID = 51 AND GPSDate = '2026-09-16' LIMIT 1`
    ).catch(() => [[]]);
    if (r.length && r[0].GPSData) {
      console.log(`\nShard ${n}: ${r[0].bytes} bytes`);
      console.log('Hex dump (first 144 bytes):');
      hexDump(r[0].GPSData, 144);
      scanForCoords(r[0].GPSData, `T887ERP Sep 16 shard ${n}`);
      break;
    }
  }

  // Also try T765EMX Sep 23 — largest blob today
  console.log('\n\n=== T765EMX Sep 23 (ID=8, blob=7488b) ===');
  for (let n = 1; n <= 4; n++) {
    const [r] = await conn.query(
      `SELECT GPSData, LENGTH(GPSData) AS bytes FROM jt808_vehicle_gps_${n}_202609
       WHERE VehiID = 8 AND GPSDate = '2026-09-23' LIMIT 1`
    ).catch(() => [[]]);
    if (r.length && r[0].GPSData) {
      console.log(`\nShard ${n}: ${r[0].bytes} bytes`);
      console.log('Hex dump (first 144 bytes):');
      hexDump(r[0].GPSData, 144);
      scanForCoords(r[0].GPSData, `T765EMX Sep 23 shard ${n}`);
      break;
    }
  }

  // Also check VehiID=89 that we know worked previously
  console.log('\n\n=== VehiID=89 Sep 2026 (reference — known good format) ===');
  for (let n = 1; n <= 4; n++) {
    const [r] = await conn.query(
      `SELECT GPSDate, LENGTH(GPSData) AS bytes, GPSData FROM jt808_vehicle_gps_${n}_202609
       WHERE VehiID = 89 ORDER BY GPSDate DESC LIMIT 1`
    ).catch(() => [[]]);
    if (r.length && r[0].GPSData) {
      const ds = String(r[0].GPSDate).slice(0, 10);
      console.log(`\nShard ${n}: ${ds}  ${r[0].bytes} bytes`);
      console.log('Hex dump (first 144 bytes):');
      hexDump(r[0].GPSData, 144);
      scanForCoords(r[0].GPSData, `VehiID=89 shard ${n}`);
      break;
    }
  }

  await conn.end();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
