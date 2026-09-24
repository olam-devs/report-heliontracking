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
 * Driving vs Idle split:
 *   Each day in the trip window is classified by GPS track distance:
 *     ≥ 5 km → Driving day    (vehicle physically moved on the road)
 *     < 5 km → Idle day       (vehicle stationary: loading, waiting at port, etc.)
 *   Driving fuel = total_fuel × (driving_gps_km / total_gps_km)   [proportional estimate]
 *   Idle fuel    = total_fuel − driving_fuel
 *   L/km         = driving_fuel / fixed_road_km   (clean efficiency metric)
 *
 * Run on VPS:
 *   cd C:\helion\_repo\fleet-incident-reporter && node scripts/generate_routes_analytics.js
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

// ─── KNOWN ROAD DISTANCES (km) ───────────────────────────────────────────────
const ROAD_KM = {
  'Mboga → Port (Direct)':     18,
  'Mboga → Port (via Ubungo)': 18,
  'Port → Vikindu':            28,
  'Vikindu → Port':            28,
};

// GPS threshold: days with total track distance ≥ this are "driving days"
const DRIVE_KM_THRESHOLD = 5;

// ─── FUEL RATING THRESHOLDS — per route (L/km) ───────────────────────────────
// Company allocation:
//   Vikindu → Port : max 0.30 L/km  (return, lighter load)
//   Port → Vikindu : max 0.45 L/km  (outbound, heavier load)
//   Mboga → Port   : range 0.30–0.45 L/km
// Lower L/km = better (less fuel used for the same road distance)
const ROUTE_ALLOC = {
  'Mboga → Port (Direct)':     { min: 0.20, max: 0.45, best: 0.30 },
  'Mboga → Port (via Ubungo)': { min: 0.20, max: 0.45, best: 0.30 },
  'Port → Vikindu':            { min: 0.20, max: 0.45, best: 0.35 },
  'Vikindu → Port':            { min: 0.20, max: 0.30, best: 0.25 },
};

function fuelRating(lPerKm, direction) {
  if (lPerKm == null) return '—';
  const alloc = ROUTE_ALLOC[direction] || { min: 0.20, max: 0.45, best: 0.30 };
  if (lPerKm < alloc.min)         return '⚠️ Too Low — Check Data';   // physically impossible for a truck
  if (lPerKm < alloc.best)        return '🏆 Below Budget — Best';
  if (lPerKm <= alloc.max)        return '✅ Within Allocation';
  if (lPerKm <= alloc.max + 0.10) return '⚠️ Slightly Over Budget';
  return                                  '🔴 Over Budget — Investigate';
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
      vd.EYouLiang / 100                                              AS endFuelL,
      vd.SLiCheng / 1000                                             AS startOdomKm,
      vd.ELiCheng / 1000                                             AS endOdomKm,
      vd.CalcRunYouHao / 100                                         AS calcDriveFuelL,
      vd.CalcIdelYouhao / 100                                        AS calcIdleFuelL,
      vd.CalcIdelTime                                                AS idleTimeSec,
      vd.DriveTime                                                   AS driveTimeSec
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
      plate:           r.plate,
      company:         r.company,
      startFuelL:      fmt2(r.startFuelL),
      endFuelL:        fmt2(r.endFuelL),
      startOdomKm:     fmt2(r.startOdomKm),
      endOdomKm:       fmt2(r.endOdomKm),
      calcDriveFuelL:  fmt2(r.calcDriveFuelL),
      calcIdleFuelL:   fmt2(r.calcIdleFuelL),
      idleTimeSec:     Number(r.idleTimeSec) || 0,
      driveTimeSec:    Number(r.driveTimeSec) || 0,
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

  // ── 4. Compute trip fuel + driving/idle split across the full window ──────────
  // Formula: used = startFuel(depDay) + Σrefueled(all days in window) − endFuel(arrDay)
  // Driving split: classify each day by GPS distance; split fuel proportionally.
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

    // Odometer distance: end reading on arrival day − start reading on departure day
    const odomKm = (arrDay.endOdomKm > 0 && depDay.startOdomKm > 0 && arrDay.endOdomKm > depDay.startOdomKm)
      ? fmt2(arrDay.endOdomKm - depDay.startOdomKm)
      : null;

    // CMSV6 pre-calculated driving vs idle fuel (sum across window)
    let calcDriveFuel = 0, calcIdleFuel = 0, totalIdleSec = 0, totalDriveSec = 0;
    let drivingDays = 0, idleDays = 0;
    for (const ds of dateRange(dsA, dsB)) {
      const day = vDays[ds];
      if (!day) continue;
      calcDriveFuel  += day.calcDriveFuelL || 0;
      calcIdleFuel   += day.calcIdleFuelL  || 0;
      totalIdleSec   += day.idleTimeSec    || 0;
      totalDriveSec  += day.driveTimeSec   || 0;
      // Classify day: if CMSV6 drive time > 0 it drove that day
      if ((day.driveTimeSec || 0) > 0) drivingDays++; else idleDays++;
    }

    const drivingFuel = calcDriveFuel > 0 ? fmt2(calcDriveFuel) : null;
    const idleFuel    = calcIdleFuel  > 0 ? fmt2(calcIdleFuel)  : null;
    const idleHrs     = totalIdleSec  > 0 ? fmt2(totalIdleSec  / 3600) : null;
    const driveHrs    = totalDriveSec > 0 ? fmt2(totalDriveSec / 3600) : null;

    return {
      startFuel:    fmt2(startFuel),
      refueled:     fmt2(refueled),
      endFuel:      fmt2(endFuel),
      usedFuel:     (usedFuel != null && usedFuel > 0) ? usedFuel : null,
      odomKm,
      drivingDays,
      idleDays,
      drivingFuel,
      idleFuel,
      driveHrs,
      idleHrs,
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
    const m      = r._metrics || {};
    const distKm = m.odomKm || ROAD_KM[direction] || null; // odometer first, fallback to fixed road km
    const totalLkm   = (distKm && m.usedFuel    > 0) ? fmt3(m.usedFuel    / distKm) : null;
    const drivingLkm = (distKm && m.drivingFuel > 0) ? fmt3(m.drivingFuel / distKm) : null;
    const ratingLkm  = drivingLkm ?? totalLkm;
    return {
      'Departure Date':       r._departureDate,
      'Arrival Date':         r._arrivalDate,
      Direction:              direction,
      'Via Ubungo':           r._viaUbungo ? 'YES' : (direction.includes('Mboga') ? 'NO' : '—'),
      Vehicle:                r.plate,
      Company:                r.company,
      'Start Fuel (L)':       m.startFuel   ?? null,
      'Refueled (L)':         m.refueled    ?? 0,
      'End Fuel (L)':         m.endFuel     ?? null,
      'Total Fuel (L)':       m.usedFuel    ?? null,
      'Driving Days':         m.drivingDays ?? null,
      'Idle Days':            m.idleDays    ?? null,
      'Drive Fuel (L)':       m.drivingFuel ?? null,
      'Idle Fuel (L)':        m.idleFuel    ?? null,
      'Drive Time (hrs)':     m.driveHrs    ?? null,
      'Idle Time (hrs)':      m.idleHrs     ?? null,
      'Odometer (km)':        m.odomKm      ?? null,
      'Road Dist (km)':       ROAD_KM[direction] || null,
      'Dist Used':            m.odomKm ? 'Odometer' : 'Road (fixed)',
      'L/km (total fuel)':    totalLkm,
      'L/km (drive fuel)':    drivingLkm,
      'Rating':               fuelRating(ratingLkm, direction),
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
    const roadKm = ROAD_KM[dir] || null;
    for (const r of validTrips(arr)) {
      const m = r._metrics || {};
      if (!byV[r.plate]) byV[r.plate] = {
        trips: 0, totalFuel: 0, drivingFuel: 0, idleFuel: 0,
        odomKm: 0, odomTrips: 0, drivingDays: 0, idleDays: 0, company: r.company,
      };
      byV[r.plate].trips++;
      byV[r.plate].totalFuel   += m.usedFuel    || 0;
      byV[r.plate].drivingFuel += m.drivingFuel || 0;
      byV[r.plate].idleFuel    += m.idleFuel    || 0;
      byV[r.plate].drivingDays += m.drivingDays || 0;
      byV[r.plate].idleDays    += m.idleDays    || 0;
      if (m.odomKm > 0) { byV[r.plate].odomKm += m.odomKm; byV[r.plate].odomTrips++; }
    }
    return Object.entries(byV).map(([plate, v]) => {
      const totalDist  = v.odomKm > 0 ? v.odomKm : (roadKm ? roadKm * v.trips : null);
      const distLabel  = v.odomKm > 0 ? 'Odometer' : 'Road (fixed)';
      const totalLkm   = (totalDist && v.totalFuel   > 0) ? fmt3(v.totalFuel   / totalDist) : null;
      const drivingLkm = (totalDist && v.drivingFuel > 0) ? fmt3(v.drivingFuel / totalDist) : null;
      const rankLkm    = drivingLkm ?? totalLkm;
      return {
        Rank:                      0,
        Vehicle:                   plate,
        Company:                   v.company,
        Direction:                 dir,
        Trips:                     v.trips,
        'Total Fuel Used (L)':     fmt2(v.totalFuel),
        'Drive Fuel (L)':          v.drivingFuel > 0 ? fmt2(v.drivingFuel) : null,
        'Idle Fuel (L)':           v.idleFuel    > 0 ? fmt2(v.idleFuel)    : null,
        'Avg Driving Days/Trip':   v.trips > 0 ? fmt2(v.drivingDays / v.trips) : null,
        'Avg Idle Days/Trip':      v.trips > 0 ? fmt2(v.idleDays    / v.trips) : null,
        'Avg Fuel/Trip (L)':       v.trips > 0 ? fmt2(v.totalFuel   / v.trips) : null,
        'Total Dist (km)':         totalDist ? fmt2(totalDist) : null,
        'Dist Source':             distLabel,
        'Avg L/km (total fuel)':   totalLkm,
        'Avg L/km (drive fuel)':   drivingLkm,
        'Avg L/100km (drive)':     drivingLkm ? fmt2(drivingLkm * 100) : null,
        'Rating':                  fuelRating(rankLkm, dir),
      };
    })
    .sort((a, b) => {
      const ka = a['Avg L/km (driving fuel)'] ?? a['Avg L/km (total fuel)'] ?? 999;
      const kb = b['Avg L/km (driving fuel)'] ?? b['Avg L/km (total fuel)'] ?? 999;
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

  // Sheet 1: Overall vehicle rankings (all routes combined; road km not meaningful across routes)
  // Use per-route rankings instead for meaningful L/km
  const overallByV = {};
  for (const r of validTrips(allClassified)) {
    const m = r._metrics || {};
    const roadKm = ROAD_KM[r._dir] || 0;
    if (!overallByV[r.plate]) overallByV[r.plate] = {
      trips: 0, totalFuel: 0, drivingFuel: 0, idleFuel: 0,
      odomKm: 0, roadKmTotal: 0, drivingDays: 0, idleDays: 0, company: r.company,
    };
    overallByV[r.plate].trips++;
    overallByV[r.plate].totalFuel   += m.usedFuel    || 0;
    overallByV[r.plate].drivingFuel += m.drivingFuel || 0;
    overallByV[r.plate].idleFuel    += m.idleFuel    || 0;
    overallByV[r.plate].roadKmTotal += roadKm;
    overallByV[r.plate].drivingDays += m.drivingDays || 0;
    overallByV[r.plate].idleDays    += m.idleDays    || 0;
    if (m.odomKm > 0) overallByV[r.plate].odomKm += m.odomKm;
  }
  const overallRows = Object.entries(overallByV).map(([plate, v]) => {
    const totalDist  = v.odomKm > 0 ? v.odomKm : (v.roadKmTotal > 0 ? v.roadKmTotal : null);
    const distLabel  = v.odomKm > 0 ? 'Odometer' : 'Road (fixed)';
    const totalLkm   = (totalDist && v.totalFuel   > 0) ? fmt3(v.totalFuel   / totalDist) : null;
    const drivingLkm = (totalDist && v.drivingFuel > 0) ? fmt3(v.drivingFuel / totalDist) : null;
    return {
      Rank:                     0,
      Vehicle:                  plate,
      Company:                  v.company,
      Trips:                    v.trips,
      'Total Fuel (L)':         fmt2(v.totalFuel),
      'Drive Fuel (L)':         v.drivingFuel > 0 ? fmt2(v.drivingFuel) : null,
      'Idle Fuel (L)':          v.idleFuel    > 0 ? fmt2(v.idleFuel)    : null,
      'Avg Driving Days/Trip':  v.trips > 0 ? fmt2(v.drivingDays / v.trips) : null,
      'Avg Idle Days/Trip':     v.trips > 0 ? fmt2(v.idleDays    / v.trips) : null,
      'Avg Fuel/Trip (L)':      v.trips > 0 ? fmt2(v.totalFuel   / v.trips) : null,
      'Total Dist (km)':        totalDist ? fmt2(totalDist) : null,
      'Dist Source':            distLabel,
      'Avg L/km (total fuel)':  totalLkm,
      'Avg L/km (drive fuel)':  drivingLkm,
      'Avg L/100km (drive)':    drivingLkm ? fmt2(drivingLkm * 100) : null,
      'Rating':                 fuelRating(drivingLkm ?? totalLkm, 'All Routes'),
    };
  })
  .sort((a, b) => {
    const ka = a['Avg L/km (drive fuel)'] ?? a['Avg L/km (total fuel)'] ?? 999;
    const kb = b['Avg L/km (drive fuel)'] ?? b['Avg L/km (total fuel)'] ?? 999;
    return ka - kb;
  })
  .map((r, i) => ({ ...r, Rank: i + 1 }));

  addSheet(wb,
    overallRows.length ? overallRows : [{ Note: 'No classified trips' }],
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
