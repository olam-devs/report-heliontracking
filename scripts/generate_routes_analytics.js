/**
 * Fleet Multi-Route Analytics
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes analysed:
 *   1. Mboga → Port Dar (direct — no Ubungo stop detected)
 *   2. Mboga → Ubungo → Port Dar
 *   3. Port Dar → Vikindu
 *   4. Vikindu → Port Dar
 *
 * Fuel methodology (matches Dar↔Mboga analysis):
 *   Used = StartFuel(depDay) + Refueled(all days in window) − EndFuel(arrDay)
 *
 * Distance methodology:
 *   Sum of haversine segments from GPS blobs across all days in trip window.
 *   Jumps > 5 km between consecutive points are skipped (GPS dropout).
 *
 * Run on VPS:
 *   cd /root && node scripts/generate_routes_analytics.js
 *
 * Requires: mysql2, xlsx  (npm install mysql2 xlsx  if not present)
 * Output:   Fleet_Routes_Analytics.xlsx  (repo root, next to scripts/)
 * ─────────────────────────────────────────────────────────────────────────────
 */

let XLSX;
try { XLSX = require('xlsx'); }
catch { XLSX = require('/root/node_modules/xlsx'); }

const mysql = require('mysql2/promise');
const path  = require('path');

const DB = {
  host: '127.0.0.1',
  port: 3311,
  user: 'root',
  password: 'cmsserverv6',
  database: '1010GPS',
};

// ─── WAYPOINTS ────────────────────────────────────────────────────────────────
const WP = {
  MBOGA:   { lat: -6.7966, lng: 39.2167, radiusKm: 1.5, label: 'Mboga Market' },
  PORT:    { lat: -6.8422, lng: 39.2958, radiusKm: 3.0, label: 'Port Dar (Bandarini)' },
  VIKINDU: { lat: -7.0144, lng: 39.3073, radiusKm: 1.5, label: 'Vikindu' },
  UBUNGO:  { lat: -6.7925, lng: 39.2094, radiusKm: 1.2, label: 'Ubungo' },
};

// ─── FUEL RATING THRESHOLDS (L/km) ───────────────────────────────────────────
// Calibrated for heavy trucks on Dar urban/peri-urban routes
function fuelRating(lPerKm) {
  if (lPerKm == null) return '—';
  if (lPerKm < 0.30)  return '✅ Excellent';
  if (lPerKm < 0.40)  return '✅ Good';
  if (lPerKm < 0.55)  return '⚠️ Slightly High';
  return '🔴 Above Normal';
}

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

const fmt2 = (n) => { const v = Number(n); return (n != null && isFinite(v) ? +v.toFixed(2) : null); };
const fmt3 = (n) => { const v = Number(n); return (n != null && isFinite(v) ? +v.toFixed(3) : null); };

const safeName = (s) => String(s).replace(/[\\/?*[\]:]/g, '').slice(0, 28);

function dateStr(d) {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// All calendar dates from dsA to dsB inclusive
function dateRange(dsA, dsB) {
  const dates = [];
  let cur = new Date(dsA);
  const end = new Date(dsB);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400000);
  }
  return dates;
}

// Sum distance from GPS points, skipping jumps > 5 km (GPS dropout)
function trackDistanceKm(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    if (d < 5) total += d;
  }
  return total;
}

// ─── EXCEL HELPERS ───────────────────────────────────────────────────────────
function addSheet(wb, data, sheetName) {
  if (!data || !data.length) data = [{ Note: 'No trips found for this route/vehicle' }];
  const ws = XLSX.utils.json_to_sheet(data);
  if (data.length > 1 && data[0] && typeof data[0] === 'object') {
    const colCount = Object.keys(data[0]).length;
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(colCount - 1)}1` };
  }
  ws['!cols'] = Array(Object.keys(data[0] || {}).length).fill({ wch: 18 });
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  const conn = await mysql.createConnection(DB);
  console.log('✅ Connected to CMSV6 DB (port 3311)');

  // ── 1. Discover GPS track tables ─────────────────────────────────────────────
  const [trackTbls] = await conn.query(`
    SELECT TABLE_NAME, TABLE_ROWS
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA='1010GPS'
      AND (TABLE_NAME LIKE '%gps%' OR TABLE_NAME LIKE '%track%'
        OR TABLE_NAME LIKE '%loc%' OR TABLE_NAME LIKE '%position%')
    ORDER BY TABLE_ROWS DESC LIMIT 15`);
  console.log(`Track tables: ${trackTbls.map((t) => `${t.TABLE_NAME}(~${t.TABLE_ROWS})`).join(', ')}`);

  const allTrackTableNames = new Set(trackTbls.map((t) => t.TABLE_NAME));
  const trackBaseMatch = trackTbls[0]?.TABLE_NAME.match(/^(.+?)_\d+_\d{6}$/);
  const trackTableBase = trackBaseMatch ? trackBaseMatch[1] : null;
  console.log(`Track base: ${trackTableBase}  known shards: ${allTrackTableNames.size}`);

  // ── 2. Fetch ALL daily records — no fuel-direction filter ─────────────────────
  // We need ALL days (including refuel days) so we can compute:
  //   used = startFuel(depDay) + sum(refueling events in window) − endFuel(arrDay)
  const [rows] = await conn.query(`
    SELECT
      vi.ID                                                           AS vehiID,
      TRIM(REPLACE(REPLACE(vi.VehiIDNO,'(CANTER)',''),'(TRUCK)','')) AS plate,
      vi.VehiIDNO                                                     AS plateRaw,
      co.Name                                                         AS company,
      vd.GPSDate                                                      AS date,
      vd.SYouLiang / 100                                              AS startFuelL,
      vd.EYouLiang / 100                                              AS endFuelL
    FROM jt808_vehicle_daily vd
    JOIN jt808_vehicle_info  vi ON vi.ID = vd.VehiID
    JOIN jt808_company_info  co ON co.ID = vi.CompanyID
    WHERE co.ID = 3
      AND vd.GPSDate >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)
      AND vd.SYouLiang > 0
      AND vd.EYouLiang > 0
    ORDER BY vi.ID, vd.GPSDate`);

  console.log(`Fetched ${rows.length} daily records (all days, incl. refuel days)`);

  // Build lookup: dailyByVehicle[vehiID][ds] = { plate, company, startFuelL, endFuelL }
  const dailyByVehicle = {};
  for (const r of rows) {
    const ds = dateStr(r.date);
    if (!dailyByVehicle[r.vehiID]) dailyByVehicle[r.vehiID] = {};
    dailyByVehicle[r.vehiID][ds] = {
      plate:       r.plate,
      company:     r.company,
      startFuelL:  fmt2(r.startFuelL),
      endFuelL:    fmt2(r.endFuelL),
    };
  }

  // ── 3. GPS blob parser + track table helpers ──────────────────────────────────
  function parseGPSBlob(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 72) return [];
    const RECORD = 72;
    const pts = [];
    for (let off = 0; off + RECORD <= buf.length; off += RECORD) {
      const lng = buf.readInt32LE(off + 40) / 1e6;
      const lat = buf.readInt32LE(off + 44) / 1e6;
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
          (Math.abs(lat) > 0.01 || Math.abs(lng) > 0.01)) pts.push({ lat, lng });
    }
    return pts;
  }

  function trackTablesForMonth(yyyymm) {
    const tables = [];
    for (let n = 1; n <= 4; n++) {
      const name = `${trackTableBase}_${n}_${yyyymm}`;
      if (allTrackTableNames.has(name)) tables.push(name);
    }
    return tables;
  }

  // Cache: vehiID_yyyymm → shard table name (or null)
  const vehicleShardCache = {};

  // Cache: vehiID_ds → pts[]  (avoid double-fetching blobs used in Pass 1 and getTripMetrics)
  const ptsCache = {};

  async function getTrackPoints(vehiID, ds) {
    const cacheKey = `${vehiID}_${ds}`;
    if (ptsCache[cacheKey] !== undefined) return ptsCache[cacheKey];
    if (!trackTableBase) { ptsCache[cacheKey] = []; return []; }

    const yyyymm = ds.replace(/-/g, '').slice(0, 6);
    const shardKey = `${vehiID}_${yyyymm}`;

    let table = vehicleShardCache[shardKey];
    if (table === undefined) {
      // Try all shards for this month to find which one holds this vehicle
      const tables = trackTablesForMonth(yyyymm);
      table = null;
      for (const t of tables) {
        const [r] = await conn.query(
          `SELECT 1 FROM ${t} WHERE VehiID = ? LIMIT 1`, [vehiID]
        ).catch(() => [[]]);
        if (r.length) { table = t; break; }
      }
      vehicleShardCache[shardKey] = table;
    }

    if (!table) { ptsCache[cacheKey] = []; return []; }

    const [r] = await conn.query(
      `SELECT GPSData FROM ${table} WHERE VehiID = ? AND GPSDate = ? LIMIT 1`,
      [vehiID, ds]
    ).catch(() => [[]]);

    const pts = (r.length && r[0].GPSData) ? parseGPSBlob(r[0].GPSData) : [];
    ptsCache[cacheKey] = pts;
    return pts;
  }

  // ── 4. Compute trip fuel and GPS distance across the full window ───────────────
  // Formula: used = startFuel(depDay) + Σrefueled(all days in window) − endFuel(arrDay)
  // GPS distance: sum haversine segments from blobs for every day in window
  function getTripMetrics(vehiID, dsA, dsB) {
    const vDays = dailyByVehicle[vehiID] || {};
    const depDay = vDays[dsA];
    const arrDay = vDays[dsB];
    if (!depDay || !arrDay) return null;

    const startFuel = depDay.startFuelL;
    const endFuel   = arrDay.endFuelL;

    // Sum refueling: any day in window where endFuel > startFuel
    let refueled = 0;
    for (const ds of dateRange(dsA, dsB)) {
      const day = vDays[ds];
      if (day && day.endFuelL > day.startFuelL) {
        refueled += day.endFuelL - day.startFuelL;
      }
    }

    const usedFuel = fmt2(startFuel + refueled - endFuel);

    // GPS distance: sum cached blobs across window
    let distKm = 0;
    for (const ds of dateRange(dsA, dsB)) {
      const pts = ptsCache[`${vehiID}_${ds}`] || [];
      distKm += trackDistanceKm(pts);
    }
    distKm = fmt2(distKm);

    const lPerKm = (distKm > 0 && usedFuel != null && usedFuel > 0)
      ? fmt3(usedFuel / distKm)
      : null;

    return {
      startFuel:  fmt2(startFuel),
      refueled:   fmt2(refueled),
      endFuel:    fmt2(endFuel),
      usedFuel:   (usedFuel != null && usedFuel > 0) ? usedFuel : null,
      distKm:     distKm > 0 ? distKm : null,
      lPerKm,
      rating:     fuelRating(lPerKm),
    };
  }

  // ── 5. Pass 1: scan GPS blobs, record waypoint hits per vehicle-day ───────────
  // Use only records where GPS blob exists (skip days with no movement data)
  const dayInfo = {}; // dayInfo[vehiID][ds] = { r, hitM, hitP, hitV, hitU }

  if (trackTableBase) {
    console.log(`\nPass 1: scanning GPS blobs for ${rows.length} records...`);
    let processed = 0, withBlob = 0;

    for (const r of rows) {
      processed++;
      if (processed % 100 === 0) {
        process.stdout.write(`\r  ${processed}/${rows.length} scanned, ${withBlob} blobs...   `);
      }

      const ds = dateStr(r.date);
      const pts = await getTrackPoints(r.vehiID, ds);
      if (!pts.length) continue;
      withBlob++;

      const hitM = pts.some((p) => isNear(p.lat, p.lng, WP.MBOGA));
      const hitP = pts.some((p) => isNear(p.lat, p.lng, WP.PORT));
      const hitV = pts.some((p) => isNear(p.lat, p.lng, WP.VIKINDU));
      const hitU = pts.some((p) => isNear(p.lat, p.lng, WP.UBUNGO));

      if (!dayInfo[r.vehiID]) dayInfo[r.vehiID] = {};
      // Store only if vehicle was near at least one waypoint (prune noise)
      if (hitM || hitP || hitV || hitU) {
        dayInfo[r.vehiID][ds] = { r, hitM, hitP, hitV, hitU };
      }
    }

    process.stdout.write('\n');
    console.log(`  Blobs read: ${withBlob} / ${rows.length}`);
  }

  // ── 6. Pass 2: classify route trips via consecutive-day transitions ────────────
  const bucket = {
    mbogaPortDirect: [],
    mbogaPortUbungo: [],
    portVikindu:     [],
    vikindPort:      [],
  };

  const WINDOW_DAYS = 3;
  const usedDepartures = new Set(); // vehiID|dsA → prevent one departure firing two routes
  const seenTrips = new Set();       // vehiID|dsA|dsB|dir → prevent exact duplicates

  for (const [vehiIDStr, vDays] of Object.entries(dayInfo)) {
    const vehiID = Number(vehiIDStr);
    const sortedDates = Object.keys(vDays).sort();

    for (let i = 0; i < sortedDates.length; i++) {
      const dsA   = sortedDates[i];
      const infoA = vDays[dsA];
      const depKey = `${vehiID}|${dsA}`;
      if (usedDepartures.has(depKey)) continue;

      for (let j = i; j < sortedDates.length; j++) {
        const dsB   = sortedDates[j];
        const infoB = vDays[dsB];
        const gapDays = (new Date(dsB) - new Date(dsA)) / 86400000;
        if (gapDays > WINDOW_DAYS) break;

        // Same day needs both endpoints already present
        if (j === i &&
            !(infoA.hitM && infoA.hitP) &&
            !(infoA.hitP && infoA.hitV) &&
            !(infoA.hitV && infoA.hitP)) continue;

        const fromM = infoA.hitM, fromP = infoA.hitP, fromV = infoA.hitV;
        const toP = infoB.hitP, toV = infoB.hitV, toU = infoB.hitU;

        let bucketKey = null;
        let viaUbungo = false;

        if (fromM && toP && !infoB.hitV) {
          viaUbungo = toU || infoA.hitU;
          bucketKey = viaUbungo ? 'mbogaPortUbungo' : 'mbogaPortDirect';
        } else if (fromP && toV && !infoB.hitM) {
          bucketKey = 'portVikindu';
        } else if (fromV && toP && !infoB.hitM) {
          bucketKey = 'vikindPort';
        }

        if (bucketKey) {
          const tripKey = `${vehiID}|${dsA}|${dsB}|${bucketKey}`;
          if (!seenTrips.has(tripKey)) {
            seenTrips.add(tripKey);
            const metrics = getTripMetrics(vehiID, dsA, dsB);
            const entry = {
              vehiID,
              plate:       infoA.r.plate,
              company:     infoA.r.company,
              _departureDate: dsA,
              _arrivalDate:   dsB,
              _viaUbungo:     viaUbungo,
              _metrics:       metrics,
            };
            bucket[bucketKey].push(entry);
          }
          usedDepartures.add(depKey);
          break;
        }
      }
    }
  }

  await conn.end();

  // ── 7. Summary ────────────────────────────────────────────────────────────────
  console.log('\n─── Route summary ───────────────────────────────────');
  console.log(`  Mboga → Port (direct):    ${bucket.mbogaPortDirect.length}`);
  console.log(`  Mboga → Ubungo → Port:    ${bucket.mbogaPortUbungo.length}`);
  console.log(`  Port → Vikindu:           ${bucket.portVikindu.length}`);
  console.log(`  Vikindu → Port:           ${bucket.vikindPort.length}`);
  const total = Object.values(bucket).reduce((s, a) => s + a.length, 0);
  console.log(`  TOTAL:                    ${total}`);

  // ── 8. Row builder ────────────────────────────────────────────────────────────
  // A trip is "valid" if fuel used is ≥ 1L (filters sensor-dead days)
  function validTrips(arr) {
    return arr.filter((r) => r._metrics && r._metrics.usedFuel != null && r._metrics.usedFuel >= 1);
  }

  function tripRow(r, direction) {
    const m = r._metrics || {};
    return {
      'Departure Date': r._departureDate,
      'Arrival Date':   r._arrivalDate,
      Direction:        direction,
      'Via Ubungo':     r._viaUbungo ? 'YES' : (direction.includes('Mboga') ? 'NO' : '—'),
      Vehicle:          r.plate,
      Company:          r.company,
      'Start Fuel (L)': m.startFuel   ?? null,
      'Refueled (L)':   m.refueled    ?? 0,
      'End Fuel (L)':   m.endFuel     ?? null,
      'Used Fuel (L)':  m.usedFuel    ?? null,
      'Distance (km)':  m.distKm      ?? null,
      'L/km':           m.lPerKm      ?? null,
      'Rating':         m.rating      ?? '—',
    };
  }

  function sortedTrips(arr, dir) {
    return validTrips(arr)
      .map((r) => tripRow(r, dir))
      .sort((a, b) =>
        (b['Departure Date'] || '').localeCompare(a['Departure Date'] || '')
      );
  }

  function vehicleRanking(arr, dir) {
    const byV = {};
    for (const r of validTrips(arr)) {
      const m = r._metrics || {};
      if (!byV[r.plate]) byV[r.plate] = { trips: 0, fuel: 0, dist: 0, company: r.company };
      byV[r.plate].trips++;
      byV[r.plate].fuel += m.usedFuel || 0;
      byV[r.plate].dist += m.distKm   || 0;
    }
    return Object.entries(byV).map(([plate, v]) => {
      const avgLPerKm = (v.dist > 0 && v.fuel > 0) ? fmt3(v.fuel / v.dist) : null;
      return {
        Rank:                    0,
        Vehicle:                 plate,
        Company:                 v.company,
        Direction:               dir,
        Trips:                   v.trips,
        'Total Fuel Used (L)':   fmt2(v.fuel),
        'Total Distance (km)':   v.dist > 0 ? fmt2(v.dist) : null,
        'Avg Fuel / Trip (L)':   v.trips > 0 ? fmt2(v.fuel / v.trips) : null,
        'Avg L/km':              avgLPerKm,
        'Avg L/100km':           avgLPerKm ? fmt2(avgLPerKm * 100) : null,
        'Rating':                fuelRating(avgLPerKm),
      };
    })
    .sort((a, b) => {
      // Sort: valid L/km ascending (best first), nulls last
      const ka = a['Avg L/km'] ?? 999, kb = b['Avg L/km'] ?? 999;
      return ka - kb;
    })
    .map((r, i) => ({ ...r, Rank: i + 1 }));
  }

  // ── 9. Build workbook ─────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  const allClassified = [
    ...bucket.mbogaPortDirect.map((r) => ({ ...r, _dir: 'Mboga → Port (Direct)' })),
    ...bucket.mbogaPortUbungo.map((r) => ({ ...r, _dir: 'Mboga → Port (via Ubungo)' })),
    ...bucket.portVikindu.map((r)     => ({ ...r, _dir: 'Port → Vikindu' })),
    ...bucket.vikindPort.map((r)      => ({ ...r, _dir: 'Vikindu → Port' })),
  ];

  // Sheet 1: Overall vehicle rankings
  addSheet(wb,
    allClassified.length ? vehicleRanking(allClassified, 'All Routes')
                         : [{ Note: 'No classified trips' }],
    '📊 Overall Rankings'
  );

  // Sheet 2: Rankings by direction
  const dirRankings = [
    ...vehicleRanking(bucket.mbogaPortDirect,  'Mboga → Port (Direct)'),
    ...vehicleRanking(bucket.mbogaPortUbungo,  'Mboga → Port (via Ubungo)'),
    ...vehicleRanking(bucket.portVikindu,       'Port → Vikindu'),
    ...vehicleRanking(bucket.vikindPort,        'Vikindu → Port'),
  ];
  addSheet(wb, dirRankings.length ? dirRankings : [{ Note: 'No classified trips' }], '📊 By Direction Rankings');

  // Sheet 3: All trips
  const allTripRows = validTrips(allClassified)
    .map((r) => tripRow(r, r._dir))
    .sort((a, b) => (b['Departure Date'] || '').localeCompare(a['Departure Date'] || ''));
  addSheet(wb, allTripRows.length ? allTripRows : [{ Note: 'No valid trips' }], '🗺 All Trips');

  // Route-specific sheets
  addSheet(wb, sortedTrips(bucket.mbogaPortDirect,  'Mboga → Port (Direct)'),     '🚚 Mboga→Port Direct');
  addSheet(wb, sortedTrips(bucket.mbogaPortUbungo,  'Mboga → Port (via Ubungo)'), '🚚 Mboga→Port Ubungo');
  addSheet(wb, sortedTrips(bucket.portVikindu,       'Port → Vikindu'),            '⚓ Port→Vikindu');
  addSheet(wb, sortedTrips(bucket.vikindPort,        'Vikindu → Port'),            '⚓ Vikindu→Port');

  // Per-vehicle sheets
  if (allClassified.length) {
    const validAll = validTrips(allClassified);
    const plates = [...new Set(validAll.map((r) => r.plate))].sort();
    for (const plate of plates.slice(0, 25)) {
      const vRows = validAll
        .filter((r) => r.plate === plate)
        .map((r) => tripRow(r, r._dir))
        .sort((a, b) => (b['Departure Date'] || '').localeCompare(a['Departure Date'] || ''));
      if (vRows.length) addSheet(wb, vRows, `🚛 ${safeName(plate)}`);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  const outPath = path.join(__dirname, '..', 'Fleet_Routes_Analytics.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`\n✅ Excel saved: ${outPath}`);
  console.log(`   Sheets (${wb.SheetNames.length}): ${wb.SheetNames.join(', ')}`);
  process.exit(0);
})().catch((e) => { console.error('\n❌ FATAL:', e.message, '\n', e.stack); process.exit(1); });
