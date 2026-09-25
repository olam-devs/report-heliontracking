/**
 * Cross-reference dispatch trips with GPS daily fuel data.
 * Reads dispatch_trips.json (embedded vehicle+date pairs from official dispatch records)
 * and queries jt808_vehicle_daily for each trip's fuel readings.
 *
 * Outputs: dispatch_fuel_results.csv
 * Run on VPS: node scripts/query_dispatch_fuel.js
 */
const mysql  = require('mysql2/promise');
const fs     = require('fs');
const path   = require('path');

const DB = { host: '127.0.0.1', port: 3311, user: 'root', password: 'cmsserverv6', database: '1010GPS' };

// Ubungo waypoint for GPS blob check (same as generate script)
const WP_UBUNGO  = { lat: -6.7821, lng: 39.2083, radiusKm: 3.0 };
const WP_PORT    = { lat: -6.8200, lng: 39.2950, radiusKm: 3.0 };
const WP_VIKINDU = { lat: -6.8760, lng: 39.5260, radiusKm: 3.0 };

function haversineKm(la1, lo1, la2, lo2) {
  const R = 6371, dLat = (la2-la1)*Math.PI/180, dLon = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
const isNear = (lat, lng, wp) => haversineKm(lat, lng, wp.lat, wp.lng) <= wp.radiusKm;

function parseGPSBlob(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 72) return [];
  const RECORD = 72, pts = [];
  for (let off = 0; off + RECORD <= buf.length; off += RECORD) {
    const lng = buf.readInt32LE(off + 40) / 1e6;
    const lat = buf.readInt32LE(off + 44) / 1e6;
    if (Math.abs(lat) > 0.01 && Math.abs(lng) > 0.01 &&
        Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      pts.push({ lat, lng });
    }
  }
  return pts;
}

(async () => {
  const conn = await mysql.createConnection(DB);

  // Load dispatch trips
  const trips = JSON.parse(fs.readFileSync(path.join(__dirname, 'dispatch_trips.json'), 'utf8'));
  console.log(`Dispatch trips to process: ${trips.length}`);

  // Get all SEMI vehicle info
  const [vehicles] = await conn.query(`
    SELECT vi.ID, TRIM(REPLACE(REPLACE(vi.VehiIDNO,'(CANTER)',''),'(TRUCK)','')) AS plate
    FROM jt808_vehicle_info vi
    JOIN jt808_company_info co ON co.ID = vi.CompanyID
    WHERE co.ID = 3
  `);
  const plateToId = {};
  for (const v of vehicles) plateToId[v.plate.replace(/\s/g,'').toUpperCase()] = v.ID;
  console.log(`SEMI vehicles in GPS system: ${vehicles.length}`);
  console.log('Known plates:', Object.keys(plateToId).sort().join(', '));

  // Get GPS track table names
  const [trackTbls] = await conn.query(`
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA='1010GPS' AND TABLE_NAME LIKE 'jt808_vehicle_gps_%'
    ORDER BY TABLE_NAME
  `);
  const allTrackTables = new Set(trackTbls.map(t => t.TABLE_NAME));
  const trackBaseMatch = trackTbls[0]?.TABLE_NAME.match(/^(.+?)_\d+_\d{6}$/);
  const trackTableBase = trackBaseMatch ? trackBaseMatch[1] : null;

  const vehicleShardCache = {};
  const ptsCache = {};

  async function getTrackPoints(vehiID, ds) {
    const key = `${vehiID}_${ds}`;
    if (ptsCache[key] !== undefined) return ptsCache[key];
    if (!trackTableBase) { ptsCache[key] = []; return []; }
    const yyyymm = ds.replace(/-/g,'').slice(0,6);
    const shard_key = `${vehiID}_${yyyymm}`;
    let table = vehicleShardCache[shard_key];
    if (table === undefined) {
      table = null;
      for (let n = 1; n <= 4; n++) {
        const name = `${trackTableBase}_${n}_${yyyymm}`;
        if (!allTrackTables.has(name)) continue;
        const [r] = await conn.query(`SELECT 1 FROM ${name} WHERE VehiID=? LIMIT 1`, [vehiID]).catch(() => [[]]);
        if (r.length) { table = name; break; }
      }
      vehicleShardCache[shard_key] = table;
    }
    if (!table) { ptsCache[key] = []; return []; }
    const [r] = await conn.query(`SELECT GPSData FROM ${table} WHERE VehiID=? AND GPSDate=? LIMIT 1`, [vehiID, ds]).catch(() => [[]]);
    const pts = (r.length && r[0].GPSData) ? parseGPSBlob(r[0].GPSData) : [];
    ptsCache[key] = pts;
    return pts;
  }

  // Process each dispatch trip
  const results = [];
  let processed = 0;

  for (const trip of trips) {
    const vehiID = plateToId[trip.VehicleClean];
    if (!vehiID) {
      results.push({ ...trip, note: 'NOT IN GPS SYSTEM' });
      continue;
    }

    // Query daily fuel for the dispatch date
    const [days] = await conn.query(`
      SELECT
        CAST(SYouLiang AS SIGNED)/100  AS startL,
        CAST(EYouLiang AS SIGNED)/100  AS endL,
        NoGps,
        DriveTime/3600                 AS driveHrs,
        CalcIdelTime/3600              AS idleHrs
      FROM jt808_vehicle_daily
      WHERE VehiID = ? AND GPSDate = ? AND NoGps = 0
        AND SYouLiang > 0 AND EYouLiang > 0
    `, [vehiID, trip.Date]);

    if (!days.length) {
      // Try ±1 day (dispatch date might be off by one)
      const d = new Date(trip.Date);
      d.setDate(d.getDate() - 1);
      const prev = d.toISOString().slice(0,10);
      d.setDate(d.getDate() + 2);
      const next = d.toISOString().slice(0,10);
      const [nearby] = await conn.query(`
        SELECT GPSDate,
               CAST(SYouLiang AS SIGNED)/100 AS startL,
               CAST(EYouLiang AS SIGNED)/100 AS endL,
               NoGps, DriveTime/3600 AS driveHrs
        FROM jt808_vehicle_daily
        WHERE VehiID = ? AND GPSDate IN (?,?,?) AND NoGps = 0
          AND SYouLiang > 0 AND EYouLiang > 0
        ORDER BY GPSDate
      `, [vehiID, prev, trip.Date, next]);

      if (!nearby.length) {
        results.push({ ...trip, note: 'NO FUEL DATA (GPS offline or sensor dead)' });
        continue;
      }
      // Use closest
      const best = nearby[0];
      const startL = Number(best.startL);
      const endL   = Number(best.endL);
      const delta  = endL - startL;
      const sensorStale = Math.abs(delta) < 0.5 && Number(best.driveHrs) > 1;
      results.push({
        ...trip,
        gpsDate:       String(best.GPSDate).slice(0,10),
        startFuel_L:   sensorStale ? null : +startL.toFixed(2),
        endFuel_L:     sensorStale ? null : +endL.toFixed(2),
        usedFuel_L:    sensorStale ? null : +(startL - endL).toFixed(2),
        driveHrs:      +Number(best.driveHrs).toFixed(2),
        sensorStale,
        note: `DATA FROM ${String(best.GPSDate).slice(0,10)} (±1 day)${sensorStale?' STALE SENSOR':''}`,
      });
      processed++;
      continue;
    }

    const day = days[0];
    const startL = Number(day.startL);
    const endL   = Number(day.endL);
    const delta  = endL - startL;
    const sensorStale = Math.abs(delta) < 0.5 && Number(day.driveHrs) > 1;

    // Check GPS blob: did vehicle pass through Ubungo / Port / Vikindu?
    const pts = await getTrackPoints(vehiID, trip.Date);
    const hitU = pts.some(p => isNear(p.lat, p.lng, WP_UBUNGO));
    const hitP = pts.some(p => isNear(p.lat, p.lng, WP_PORT));
    const hitV = pts.some(p => isNear(p.lat, p.lng, WP_VIKINDU));

    results.push({
      ...trip,
      gpsDate:       trip.Date,
      startFuel_L:   sensorStale ? null : +startL.toFixed(2),
      endFuel_L:     sensorStale ? null : +endL.toFixed(2),
      usedFuel_L:    sensorStale ? null : +(startL - endL).toFixed(2),
      driveHrs:      +Number(day.driveHrs).toFixed(2),
      idleHrs:       +Number(day.idleHrs).toFixed(2),
      sensorStale,
      passedUbungo:  hitU ? 'YES' : (pts.length ? 'NO' : 'NO GPS'),
      passedPort:    hitP ? 'YES' : (pts.length ? 'NO' : 'NO GPS'),
      passedVikindu: hitV ? 'YES' : (pts.length ? 'NO' : 'NO GPS'),
      note: sensorStale ? 'STALE SENSOR' : '',
    });
    processed++;

    if (processed % 50 === 0) process.stdout.write(`\r  ${processed}/${trips.length}...`);
  }

  process.stdout.write('\n');
  console.log(`Processed: ${processed}/${trips.length}`);

  // Write CSV
  const csvPath = path.join(__dirname, '..', 'dispatch_fuel_results.csv');
  const cols = ['Date','VehicleClean','TripType','gpsDate','startFuel_L','endFuel_L',
                'usedFuel_L','driveHrs','idleHrs','passedUbungo','passedPort','passedVikindu','sensorStale','note'];
  const rows = [cols.join(',')];
  for (const r of results) {
    rows.push(cols.map(c => {
      const v = r[c] ?? '';
      return String(v).includes(',') ? `"${v}"` : v;
    }).join(','));
  }
  fs.writeFileSync(csvPath, rows.join('\n'));
  console.log(`✅ Saved: ${csvPath}`);

  await conn.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
