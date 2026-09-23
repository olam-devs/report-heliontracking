/**
 * Fleet Multi-Route Analytics
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes analysed:
 *   1. Mboga → Port Dar (direct — no Ubungo stop detected)
 *   2. Mboga → Ubungo → Port Dar
 *   3. Port Dar → Vikindu
 *   4. Vikindu → Port Dar
 *
 * Run on VPS:
 *   cd /root && node generate_routes_analytics.js
 *
 * Requires: mysql2, xlsx  (npm install mysql2 xlsx  if not present)
 * Output:   /root/Fleet_Routes_Analytics.xlsx
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Try to require xlsx — install path may vary
let XLSX;
try { XLSX = require('xlsx'); }
catch { XLSX = require('/root/node_modules/xlsx'); }

const mysql = require('mysql2/promise');
const path  = require('path');
const os    = require('os');

const DB = {
  host: '127.0.0.1',
  port: 3311,
  user: 'root',
  password: 'cmsserverv6',
  database: '1010GPS',
};

// ─── WAYPOINTS ────────────────────────────────────────────────────────────────
// All coords in decimal degrees; radiusKm = detection radius around point
const WP = {
  // Mboga Market, Dar es Salaam
  MBOGA:   { lat: -6.7966, lng: 39.2167, radiusKm: 1.5,  label: 'Mboga Market' },
  // Dar es Salaam Port (Bandarini) — large radius covers whole port area
  // 6°50'31.8"S 39°17'44.9"E = -6.84217, 39.29581
  PORT:    { lat: -6.8422, lng: 39.2958, radiusKm: 3.0,  label: 'Port Dar (Bandarini)' },
  // Vikindu — from live GPS screenshot: -7.014427, 39.307330
  VIKINDU: { lat: -7.0144, lng: 39.3073, radiusKm: 1.5,  label: 'Vikindu' },
  // Ubungo interchange (common Dar stopover point)
  UBUNGO:  { lat: -6.7925, lng: 39.2094, radiusKm: 1.2,  label: 'Ubungo' },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const isNear = (lat, lng, wp) =>
  lat != null && lng != null && haversineKm(lat, lng, wp.lat, wp.lng) <= wp.radiusKm;

const fmt2 = (n) => (n != null && isFinite(n) ? +n.toFixed(2) : null);

const safeName = (s) => String(s).replace(/[\\/?*[\]:]/g, '').slice(0, 28);

function dateStr(d) {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// ─── EXCEL HELPERS ───────────────────────────────────────────────────────────
function addSheet(wb, data, sheetName) {
  if (!data || !data.length) data = [{ Note: 'No trips found for this route/vehicle' }];
  const ws = XLSX.utils.json_to_sheet(data);
  if (data.length > 1 && data[0] && typeof data[0] === 'object') {
    const colCount = Object.keys(data[0]).length;
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(colCount - 1)}1` };
  }
  // Column widths
  ws['!cols'] = Array(Object.keys(data[0] || {}).length).fill({ wch: 16 });
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  const conn = await mysql.createConnection(DB);
  console.log('✅ Connected to CMSV6 DB (port 3311)');

  // ── 1. Discover daily table columns ─────────────────────────────────────────
  const [colRows] = await conn.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='1010GPS' AND TABLE_NAME='jt808_vehicle_daily'
    ORDER BY ORDINAL_POSITION`);
  const cols = colRows.map((r) => r.COLUMN_NAME);
  console.log(`Daily cols: ${cols.join(', ')}`);

  // CMSV6 Chinese column names:
  //   SWeiDu = start latitude (纬度), SJingDu = start longitude (经度)
  //   EWeiDu = end latitude,           EJingDu = end longitude
  //   SLiCheng = start odometer,       ELiCheng = end odometer (×0.1 km)
  const startLatCol = cols.find((c) => /^SWeiDu$/i.test(c))  || cols.find((c) => /^s.*lat/i.test(c));
  const startLngCol = cols.find((c) => /^SJingDu$/i.test(c)) || cols.find((c) => /^s.*lo?n/i.test(c));
  const endLatCol   = cols.find((c) => /^EWeiDu$/i.test(c))  || cols.find((c) => /^e.*lat/i.test(c));
  const endLngCol   = cols.find((c) => /^EJingDu$/i.test(c)) || cols.find((c) => /^e.*lo?n/i.test(c));
  // Odometer cols for distance
  const sOdoCol = cols.find((c) => /^SLiCheng$/i.test(c));
  const eOdoCol = cols.find((c) => /^ELiCheng$/i.test(c));
  console.log(`Coord cols: sLat=${startLatCol} sLng=${startLngCol} eLat=${endLatCol} eLng=${endLngCol}`);
  console.log(`Odometer cols: start=${sOdoCol} end=${eOdoCol}`);

  // ── 2. Discover GPS track tables ─────────────────────────────────────────────
  const [trackTbls] = await conn.query(`
    SELECT TABLE_NAME, TABLE_ROWS
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA='1010GPS'
      AND (TABLE_NAME LIKE '%gps%' OR TABLE_NAME LIKE '%track%'
        OR TABLE_NAME LIKE '%loc%' OR TABLE_NAME LIKE '%position%')
    ORDER BY TABLE_ROWS DESC LIMIT 15`);
  console.log(`Track tables: ${trackTbls.map((t) => `${t.TABLE_NAME}(~${t.TABLE_ROWS})`).join(', ')}`);

  // ── 3. Fetch Distribution daily records (last 6 months, fuel present) ────────
  const coordSelect = (startLatCol && endLatCol)
    ? `, vd.${startLatCol}/1000000 AS sLat, vd.${startLngCol}/1000000 AS sLng,
         vd.${endLatCol}/1000000   AS eLat, vd.${endLngCol}/1000000   AS eLng`
    : ', NULL AS sLat, NULL AS sLng, NULL AS eLat, NULL AS eLng';

  // Distance from odometer diff (units are 0.1 km → ÷10 for km); guard against rollover
  const distSelect = (sOdoCol && eOdoCol)
    ? `, CASE WHEN vd.${eOdoCol} > vd.${sOdoCol}
              THEN (CAST(vd.${eOdoCol} AS SIGNED) - CAST(vd.${sOdoCol} AS SIGNED)) / 10
              ELSE NULL END AS distKm`
    : ', NULL AS distKm';

  const [rows] = await conn.query(`
    SELECT
      vi.ID                                                           AS vehiID,
      TRIM(REPLACE(REPLACE(vi.VehiIDNO,'(CANTER)',''),'(TRUCK)','')) AS plate,
      vi.VehiIDNO                                                     AS plateRaw,
      co.Name                                                         AS company,
      vd.GPSDate                                                      AS date,
      vd.SYouLiang / 100                                              AS startFuelL,
      vd.EYouLiang / 100                                              AS endFuelL,
      -- UNSIGNED subtraction overflows when EYouLiang > SYouLiang (refuel day)
      CASE WHEN vd.SYouLiang >= vd.EYouLiang
           THEN (CAST(vd.SYouLiang AS SIGNED) - CAST(vd.EYouLiang AS SIGNED)) / 100
           ELSE NULL END                                              AS usedFuelL
      ${coordSelect}
      ${distSelect}
    FROM jt808_vehicle_daily vd
    JOIN jt808_vehicle_info  vi ON vi.ID = vd.VehiID
    JOIN jt808_company_info  co ON co.ID = vi.CompanyID
    WHERE co.ID = 9
      AND vd.GPSDate >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)
      AND vd.SYouLiang > 0
      AND vd.EYouLiang > 0
      AND vd.SYouLiang >= vd.EYouLiang   -- skip refuel days (fuel went up)
    ORDER BY vd.GPSDate DESC, vi.VehiIDNO`);

  console.log(`Fetched ${rows.length} daily fuel records`);

  // ── 4. Probe GPS track tables ────────────────────────────────────────────────
  // Tables are partitioned: jt808_vehicle_gps_N_YYYYMM (N=1..4, shard by device)
  // We need to query all N shards for a given YYYYMM
  let tLatCol = null, tLngCol = null, tTimeCol = null, tVidCol = null;
  let coordScale = 1000000;
  let trackTableBase = null; // e.g. "jt808_vehicle_gps"
  let allTrackTableNames = new Set(); // full names present in DB

  if (trackTbls.length) {
    // Probe columns from the first table
    const firstTable = trackTbls[0].TABLE_NAME;
    const [tCols] = await conn.query(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA='1010GPS' AND TABLE_NAME=?
      ORDER BY ORDINAL_POSITION LIMIT 30`, [firstTable]);
    const tc = tCols.map((r) => r.COLUMN_NAME);
    console.log(`Track table '${firstTable}' cols: ${tc.join(', ')}`);

    // CMSV6 Chinese GPS cols: WeiDu=latitude, JingDu=longitude, GPSTime=timestamp
    tLatCol  = tc.find((c) => /^WeiDu$/i.test(c))  || tc.find((c) => /^lat/i.test(c));
    tLngCol  = tc.find((c) => /^JingDu$/i.test(c)) || tc.find((c) => /^lo?ng/i.test(c));
    tTimeCol = tc.find((c) => /^GPSTime$/i.test(c)) || tc.find((c) => /time|gpstime/i.test(c));
    tVidCol  = tc.find((c) => /^VehiID$/i.test(c)) || tc.find((c) => /vehi.*id|vid/i.test(c)) || 'VehiID';

    // Detect coordinate scale from sample
    const [samp] = await conn.query(
      `SELECT ${tLatCol} AS lat FROM ${firstTable} WHERE ${tLatCol} != 0 LIMIT 1`);
    if (samp.length) {
      const lat = Number(samp[0].lat);
      coordScale = Math.abs(lat) > 90 ? 1000000 : 1;
      console.log(`Track scale: ÷${coordScale}  sample lat=${lat}`);
    }

    // Collect all table names matching the partition pattern
    trackTbls.forEach((t) => allTrackTableNames.add(t.TABLE_NAME));

    // Extract base name pattern (e.g. "jt808_vehicle_gps")
    const m = firstTable.match(/^(.+?)_\d+_\d{6}$/);
    trackTableBase = m ? m[1] : null;
    console.log(`Track base: ${trackTableBase}, shards known: ${allTrackTableNames.size}`);
  }

  // Helper: get all shard table names for a given YYYYMM
  function trackTablesForMonth(yyyymm) {
    const tables = [];
    for (let n = 1; n <= 4; n++) {
      const name = `${trackTableBase}_${n}_${yyyymm}`;
      if (allTrackTableNames.has(name)) tables.push(name);
    }
    return tables;
  }

  // Query GPS points for a vehicle on a date across all shards
  async function getTrackPoints(vehiID, ds) {
    if (!trackTableBase || !tLatCol) return [];
    const yyyymm = ds.replace(/-/g, '').slice(0, 6);
    const tables = trackTablesForMonth(yyyymm);
    if (!tables.length) return [];

    const unionParts = tables.map(
      (t) => `SELECT ${tLatCol}/${coordScale} AS lat, ${tLngCol}/${coordScale} AS lng, ${tTimeCol} AS t
               FROM ${t} WHERE ${tVidCol}=${conn.escape(vehiID)} AND DATE(${tTimeCol})=${conn.escape(ds)}`
    );
    const sql = unionParts.join(' UNION ALL ') + ` ORDER BY t`;
    const [pts] = await conn.query(sql).catch(() => [[]]);
    return pts;
  }

  // ── 5. Classify trips into routes ────────────────────────────────────────────
  const bucket = {
    mbogaPortDirect: [],
    mbogaPortUbungo: [],
    portVikindu:     [],
    vikindPort:      [],
  };

  const hasCoords = !!(startLatCol && rows.some((r) => r.sLat != null && r.sLat !== 0));
  console.log(`Has daily start/end coords: ${hasCoords}`);

  for (const r of rows) {
    r.usedFuelL = fmt2(r.usedFuelL);
    r.startFuelL = fmt2(r.startFuelL);
    r.endFuelL   = fmt2(r.endFuelL);
    r.distKm     = r.distKm ? fmt2(r.distKm) : null;
    r.kmPerL     = r.distKm && r.usedFuelL > 0 ? fmt2(r.distKm / r.usedFuelL) : null;
    r.lPer100km  = r.distKm && r.usedFuelL > 0 ? fmt2(r.usedFuelL / r.distKm * 100) : null;

    if (hasCoords) {
      const fromMboga   = isNear(r.sLat, r.sLng, WP.MBOGA);
      const toPort      = isNear(r.eLat, r.eLng, WP.PORT);
      const fromPort    = isNear(r.sLat, r.sLng, WP.PORT);
      const toVikindu   = isNear(r.eLat, r.eLng, WP.VIKINDU);
      const fromVikindu = isNear(r.sLat, r.sLng, WP.VIKINDU);

      if (fromMboga && toPort) { r._needUbungoCheck = true; bucket.mbogaPortDirect.push(r); }
      else if (fromPort && toVikindu) bucket.portVikindu.push(r);
      else if (fromVikindu && isNear(r.eLat, r.eLng, WP.PORT)) bucket.vikindPort.push(r);
    }
  }

  // ── 6. Detect routes + Ubungo stops via GPS track ────────────────────────────
  if (trackTableBase && tLatCol && (bucket.mbogaPortDirect.length || !hasCoords)) {
    console.log('\nClassifying trips via GPS track tables (may take a minute)...');

    const toCheck = hasCoords ? bucket.mbogaPortDirect : rows.slice(0, 1000);
    let checked = 0;
    for (const r of toCheck) {
      const ds = dateStr(r.date);
      const pts = await getTrackPoints(r.vehiID, ds);

      if (!pts.length) continue;
      checked++;

      if (!hasCoords) {
        const first = pts[0], last = pts[pts.length - 1];
        const hitM = pts.some((p) => isNear(p.lat, p.lng, WP.MBOGA));
        const hitP = pts.some((p) => isNear(p.lat, p.lng, WP.PORT));
        const hitV = pts.some((p) => isNear(p.lat, p.lng, WP.VIKINDU));
        const hitU = pts.some((p) => isNear(p.lat, p.lng, WP.UBUNGO));

        const fromM = isNear(first.lat, first.lng, WP.MBOGA) || (hitM && !hitP && !hitV);
        const fromP = isNear(first.lat, first.lng, WP.PORT);
        const fromV = isNear(first.lat, first.lng, WP.VIKINDU);
        const toP   = isNear(last.lat,  last.lng,  WP.PORT)    || hitP;
        const toV   = isNear(last.lat,  last.lng,  WP.VIKINDU) || hitV;

        if (fromM && toP) {
          r._viaUbungo = hitU;
          if (hitU) bucket.mbogaPortUbungo.push(r);
          else       bucket.mbogaPortDirect.push(r);
        } else if (fromP && toV) {
          bucket.portVikindu.push(r);
        } else if (fromV && toP) {
          bucket.vikindPort.push(r);
        }
      } else {
        // Already in mbogaPortDirect — check if Ubungo was visited
        if (pts.some((p) => isNear(p.lat, p.lng, WP.UBUNGO))) {
          r._viaUbungo = true;
        }
      }
    }

    if (hasCoords) {
      // Split mbogaPortDirect → direct vs via Ubungo
      bucket.mbogaPortUbungo = bucket.mbogaPortDirect.filter((r) => r._viaUbungo);
      bucket.mbogaPortDirect  = bucket.mbogaPortDirect.filter((r) => !r._viaUbungo);
    }

    console.log(`Checked ${checked} tracks`);
  }

  await conn.end();

  // ── 7. Print summary ──────────────────────────────────────────────────────────
  console.log('\n─── Route summary ───────────────────────────────────');
  console.log(`  Mboga → Port (direct):      ${bucket.mbogaPortDirect.length}`);
  console.log(`  Mboga → Ubungo → Port:      ${bucket.mbogaPortUbungo.length}`);
  console.log(`  Port → Vikindu:             ${bucket.portVikindu.length}`);
  console.log(`  Vikindu → Port:             ${bucket.vikindPort.length}`);
  const total = Object.values(bucket).reduce((s, a) => s + a.length, 0);
  console.log(`  TOTAL classified:           ${total} / ${rows.length}`);
  if (total === 0) {
    console.log('\n⚠  No trips matched any route. Daily table has no GPS coords and no track table found.');
    console.log('   Output will show all Distribution fuel records with date/fuel columns for manual review.');
  }

  // ── 8. Build row mapper ───────────────────────────────────────────────────────
  function tripRow(r, direction) {
    return {
      Date:             dateStr(r.date),
      Direction:        direction,
      'Via Ubungo':     r._viaUbungo ? 'YES' : (direction.includes('Mboga') ? 'NO' : '—'),
      Vehicle:          r.plate,
      Company:          r.company,
      'Start Fuel (L)': r.startFuelL,
      'End Fuel (L)':   r.endFuelL,
      'Used Fuel (L)':  r.usedFuelL,
      'Distance (km)':  r.distKm,
      'km/L':           r.kmPerL,
      'L/100km':        r.lPer100km,
    };
  }

  function sortedTrips(arr, dir) {
    return arr
      .map((r) => tripRow(r, dir))
      .sort((a, b) => {
        // Best km/L first; if null, push to bottom
        const ka = a['km/L'] ?? -1, kb = b['km/L'] ?? -1;
        if (kb !== ka) return kb - ka;
        return b.Date.localeCompare(a.Date);
      });
  }

  function vehicleRanking(arr, dir) {
    const byV = {};
    for (const r of arr) {
      if (!byV[r.plate]) byV[r.plate] = { trips: 0, fuel: 0, km: 0, company: r.company };
      byV[r.plate].trips++;
      byV[r.plate].fuel += r.usedFuelL || 0;
      byV[r.plate].km   += r.distKm   || 0;
    }
    return Object.entries(byV).map(([plate, v]) => ({
      Rank:                   0,
      Vehicle:                plate,
      Company:                v.company,
      Direction:              dir,
      Trips:                  v.trips,
      'Total Fuel Used (L)':  fmt2(v.fuel),
      'Total Distance (km)':  v.km > 0 ? fmt2(v.km) : '—',
      'Avg km/L':             v.km > 0 && v.fuel > 0 ? fmt2(v.km / v.fuel) : null,
      'Avg L/100km':          v.km > 0 && v.fuel > 0 ? fmt2(v.fuel / v.km * 100) : null,
    }))
    .sort((a, b) => (b['Avg km/L'] ?? -1) - (a['Avg km/L'] ?? -1))
    .map((r, i) => ({ ...r, Rank: i + 1 }));
  }

  // ── 9. Build workbook ─────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  const allClassified = [
    ...bucket.mbogaPortDirect.map((r) => ({ ...r, _dir: 'Mboga → Port (Direct)' })),
    ...bucket.mbogaPortUbungo.map((r) => ({ ...r, _dir: 'Mboga → Port (via Ubungo)' })),
    ...bucket.portVikindu.map((r)    => ({ ...r, _dir: 'Port → Vikindu' })),
    ...bucket.vikindPort.map((r)     => ({ ...r, _dir: 'Vikindu → Port' })),
  ];

  // ── Sheet 1: Overall vehicle rankings (all routes, best km/L first) ───────────
  if (allClassified.length) {
    addSheet(wb, vehicleRanking(allClassified, 'All Routes'), '📊 Overall Rankings');
  } else {
    // Fallback: rank by fuel used from all distribution records
    addSheet(wb, vehicleRanking(rows, 'Distribution'), '📊 Vehicle Rankings');
  }

  // ── Sheet 2: Route rankings per direction ─────────────────────────────────────
  const dirRankings = [
    ...vehicleRanking(bucket.mbogaPortDirect,  'Mboga → Port (Direct)'),
    ...vehicleRanking(bucket.mbogaPortUbungo,  'Mboga → Port (via Ubungo)'),
    ...vehicleRanking(bucket.portVikindu,       'Port → Vikindu'),
    ...vehicleRanking(bucket.vikindPort,        'Vikindu → Port'),
  ];
  addSheet(wb, dirRankings.length ? dirRankings : [{ Note: 'No classified trips yet' }], '📊 By Direction Rankings');

  // ── Sheet 3: All route trips combined ─────────────────────────────────────────
  if (allClassified.length) {
    const allTripRows = allClassified
      .map((r) => tripRow(r, r._dir))
      .sort((a, b) => (b['km/L'] ?? -1) - (a['km/L'] ?? -1));
    addSheet(wb, allTripRows, '🗺 All Trips');
  } else {
    // Fallback: raw distribution records
    const fallbackRows = rows.map((r) => ({
      Date:             dateStr(r.date),
      Vehicle:          r.plate,
      Company:          r.company,
      'Start Fuel (L)': r.startFuelL,
      'End Fuel (L)':   r.endFuelL,
      'Used Fuel (L)':  r.usedFuelL,
      'Distance (km)':  r.distKm,
      'km/L':           r.kmPerL,
      'L/100km':        r.lPer100km,
    })).sort((a, b) => (b['km/L'] ?? -1) - (a['km/L'] ?? -1));
    addSheet(wb, fallbackRows, '📋 All Distribution Records');
  }

  // ── Route-specific sheets ─────────────────────────────────────────────────────
  addSheet(wb, sortedTrips(bucket.mbogaPortDirect,  'Mboga → Port (Direct)'),      '🚚 Mboga→Port Direct');
  addSheet(wb, sortedTrips(bucket.mbogaPortUbungo,  'Mboga → Port (via Ubungo)'), '🚚 Mboga→Port Ubungo');
  addSheet(wb, sortedTrips(bucket.portVikindu,       'Port → Vikindu'),             '⚓ Port→Vikindu');
  addSheet(wb, sortedTrips(bucket.vikindPort,        'Vikindu → Port'),             '⚓ Vikindu→Port');

  // ── Per-vehicle sheets (only if classified trips exist) ───────────────────────
  if (allClassified.length) {
    const plates = [...new Set(allClassified.map((r) => r.plate))].sort();
    for (const plate of plates.slice(0, 25)) {
      const vRows = allClassified
        .filter((r) => r.plate === plate)
        .map((r) => tripRow(r, r._dir))
        .sort((a, b) => (b['km/L'] ?? -1) - (a['km/L'] ?? -1));
      if (vRows.length) addSheet(wb, vRows, `🚛 ${safeName(plate)}`);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  const outDir = process.env.HOME || os.homedir();
  const outPath = path.join(outDir, 'Fleet_Routes_Analytics.xlsx');
  XLSX.writeFile(wb, outPath);

  console.log(`\n✅ Excel saved: ${outPath}`);
  console.log(`   Sheets (${wb.SheetNames.length}): ${wb.SheetNames.join(', ')}`);
  process.exit(0);
})().catch((e) => { console.error('\n❌ FATAL:', e.message, '\n', e.stack); process.exit(1); });
