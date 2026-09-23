/**
 * Parse GPS blob for a known vehicle on a known date
 * and print all coordinates to verify parsing + waypoint matching.
 * Run on VPS: node scripts\probe_blob_coords.js
 */
const mysql = require('mysql2/promise');
const DB = { host:'127.0.0.1', port:3311, user:'root', password:'cmsserverv6', database:'1010GPS' };

// Known waypoints to test against
const WP = {
  MBOGA:   { lat: -6.7966, lng: 39.2167, r: 1.5 },
  PORT:    { lat: -6.8422, lng: 39.2958, r: 3.0 },
  VIKINDU: { lat: -7.0144, lng: 39.3073, r: 1.5 },
  UBUNGO:  { lat: -6.7925, lng: 39.2094, r: 1.2 },
};

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parseGPSBlob(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 72) return [];
  const RECORD = 36;
  const pts = [];
  for (let off = RECORD; off + RECORD <= buf.length; off += RECORD) {
    const lng = buf.readInt32LE(off + 3) / 1e6;
    const lat = buf.readInt32LE(off + 7) / 1e6;
    if (Math.abs(lat) > 0.1 && Math.abs(lng) > 0.1) pts.push({ lat, lng });
  }
  return pts;
}

(async () => {
  const conn = await mysql.createConnection(DB);

  // 1. Find T887ERP vehicle ID
  const [vRows] = await conn.query(
    `SELECT ID, VehiIDNO FROM jt808_vehicle_info WHERE VehiIDNO LIKE '%T887ERP%' LIMIT 3`);
  console.log('T887ERP vehicles:', vRows);

  // 2. Also find SEMI vehicles (CompanyID=3) with recent GPS data
  const [distV] = await conn.query(`
    SELECT vi.ID, vi.VehiIDNO FROM jt808_vehicle_info vi
    WHERE vi.CompanyID = 3
    LIMIT 8`);
  console.log('\nSample Distribution vehicles:', distV.map(v => `${v.ID}:${v.VehiIDNO}`).join(', '));

  // 3. For each, try to find a GPS blob and print parsed coords
  const allVehicles = [...vRows, ...distV];
  for (const v of allVehicles.slice(0, 5)) {
    // Try recent months
    for (const yyyymm of ['202609', '202608', '202607']) {
      for (let n = 1; n <= 4; n++) {
        const tbl = `jt808_vehicle_gps_${n}_${yyyymm}`;
        const [r] = await conn.query(
          `SELECT GPSDate, LENGTH(GPSData) AS bytes, GPSData FROM ${tbl}
           WHERE VehiID = ? ORDER BY GPSDate DESC LIMIT 1`, [v.ID]
        ).catch(() => [[]]);

        if (r.length && r[0].GPSData) {
          const ds = String(r[0].GPSDate).slice(0,10);
          const pts = parseGPSBlob(r[0].GPSData);
          console.log(`\n── ${v.VehiIDNO} (ID=${v.ID})  ${ds}  blob=${r[0].bytes}b  points=${pts.length}  shard=${n}_${yyyymm}`);
          pts.forEach((p, i) => {
            const hits = Object.entries(WP)
              .filter(([,w]) => haversineKm(p.lat, p.lng, w.lat, w.lng) <= w.r)
              .map(([name,w]) => `${name}(${haversineKm(p.lat,p.lng,w.lat,w.lng).toFixed(1)}km)`)
              .join(', ');
            console.log(`   [${i}] lat=${p.lat.toFixed(5)}  lng=${p.lng.toFixed(5)}  ${hits ? '✅ '+hits : ''}`);
          });

          // Also print distances from each waypoint for first/last points
          if (pts.length) {
            const p = pts[0];
            console.log(`  FIRST point distances:`);
            Object.entries(WP).forEach(([name, w]) =>
              console.log(`    → ${name}: ${haversineKm(p.lat,p.lng,w.lat,w.lng).toFixed(2)} km`)
            );
          }
          break; // found a blob for this month, move to next vehicle
        }
      }
    }
  }

  // 4. Also check what a Sep 16 blob looks like for T887ERP specifically
  if (vRows.length) {
    console.log('\n── T887ERP Sep 16 specifically ──');
    for (let n = 1; n <= 4; n++) {
      const [r] = await conn.query(
        `SELECT GPSData, LENGTH(GPSData) AS bytes FROM jt808_vehicle_gps_${n}_202609
         WHERE VehiID = ? AND GPSDate = '2026-09-16' LIMIT 1`, [vRows[0].ID]
      ).catch(() => [[]]);
      if (r.length && r[0].GPSData) {
        const pts = parseGPSBlob(r[0].GPSData);
        console.log(`  shard ${n}: ${r[0].bytes} bytes, ${pts.length} points`);
        pts.forEach((p,i) => console.log(`   [${i}] lat=${p.lat.toFixed(5)} lng=${p.lng.toFixed(5)}`));
      }
    }
  }

  await conn.end();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
