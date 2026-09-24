/**
 * Dead-simple buffer debug: fetch T887ERP Sep 16 blob from shard 3
 * and print exactly what bytes are at the claimed coord offsets.
 * Run: node scripts/probe_buf_debug.js
 */
const mysql = require('mysql2/promise');
const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

(async () => {
  const conn = await mysql.createConnection(DB);

  const [r] = await conn.query(
    `SELECT GPSData, LENGTH(GPSData) AS byteLen
     FROM jt808_vehicle_gps_3_202609
     WHERE VehiID = 51 AND GPSDate = '2026-09-16' LIMIT 1`
  );

  if (!r.length) { console.log('No row found'); await conn.end(); return; }

  const gps = r[0].GPSData;
  const len = Number(r[0].byteLen);

  console.log(`byteLen=${len}  typeof GPSData=${typeof gps}  isBuffer=${Buffer.isBuffer(gps)}`);
  if (gps && typeof gps === 'object') {
    console.log(`constructor=${gps.constructor?.name}  .length=${gps.length}`);
  }

  // Convert to Buffer if needed
  const buf = Buffer.isBuffer(gps) ? gps : Buffer.from(gps);
  console.log(`buf.length=${buf.length}`);

  // Print first 10 bytes raw
  const rawFirst = [];
  for (let i = 0; i < Math.min(10, buf.length); i++) rawFirst.push(buf[i].toString(16).padStart(2,'0').toUpperCase());
  console.log(`First 10 bytes: ${rawFirst.join(' ')}`);

  // Print bytes at offsets 36-50
  console.log('\nBytes at offsets 36-50:');
  for (let i = 36; i <= 50 && i < buf.length; i++) {
    console.log(`  [${i}] = 0x${buf[i].toString(16).padStart(2,'0').toUpperCase()} (${buf[i]})`);
  }

  // Read int32 at offset 40 and 44
  if (buf.length >= 48) {
    const lng = buf.readInt32LE(40);
    const lat = buf.readInt32LE(44);
    console.log(`\nreadInt32LE(40) = ${lng}  →  ${(lng/1e6).toFixed(6)}°`);
    console.log(`readInt32LE(44) = ${lat}  →  ${(lat/1e6).toFixed(6)}°`);
  }

  // Also scan ALL 4-byte windows for Tanzania coords in first 200 bytes
  console.log('\nScanning first 200 bytes for Tanzania-range values:');
  const end = Math.min(buf.length - 4, 200);
  let found = 0;
  for (let off = 0; off <= end; off++) {
    const v = buf.readInt32LE(off);
    if ((v >= -8000000 && v <= -1000000) || (v >= 38000000 && v <= 41000000)) {
      console.log(`  [${off}] int32LE=${v}  →  ${(v/1e6).toFixed(6)}`);
      found++;
    }
  }
  if (!found) console.log('  (none found — coordinates missing from first 200 bytes)');

  // Simulate the parseGPSBlob loop manually for first 5 records
  console.log('\nSimulating RECORD=72 loop (first 5 iterations):');
  const RECORD = 72;
  for (let off = 0; off < Math.min(buf.length - RECORD, RECORD * 5); off += RECORD) {
    const lng2 = buf.readInt32LE(off + 40) / 1e6;
    const lat2 = buf.readInt32LE(off + 44) / 1e6;
    const pass = Math.abs(lat2) <= 90 && Math.abs(lng2) <= 180 && (Math.abs(lat2) > 0.01 || Math.abs(lng2) > 0.01);
    console.log(`  off=${off}: lng=${lng2.toFixed(6)} lat=${lat2.toFixed(6)}  filter=${pass ? 'PASS' : 'FAIL'}`);
  }

  await conn.end();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
