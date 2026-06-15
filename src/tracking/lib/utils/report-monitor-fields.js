const { formatDurationShort, ageSecondsFromNow, stalenessLevel, parseTs } = require('./report-time');
const geocode = require('./geocode-cache');

const FUEL_WARN_SEC = parseInt(process.env.REPORT_FUEL_WARN_SEC || '', 10) || 2 * 3600;
const FUEL_ERR_SEC = parseInt(process.env.REPORT_FUEL_ERR_SEC || '', 10) || 6 * 3600;
const GPRS_WARN_SEC = parseInt(process.env.REPORT_GPRS_WARN_SEC || '', 10) || 2 * 3600;
const GPRS_ERR_SEC = parseInt(process.env.REPORT_GPRS_ERR_SEC || '', 10) || 6 * 3600;

function pickLocationName(live) {
  if (!live) return null;
  const ps = live.ps != null ? String(live.ps).trim() : '';
  if (ps && ps.length > 2 && !/^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(ps)) return ps;
  if (live.lat != null && live.lng != null && Math.abs(live.lat) > 0.001) {
    const cached = geocode.resolveSync(live.lat, live.lng);
    if (cached) return cached;
    return `${Number(live.lat).toFixed(5)}, ${Number(live.lng).toFixed(5)}`;
  }
  return null;
}

/**
 * Add fuelDisplay, gprsDisplay, antennaDisplay for report UI.
 */
function enrichMonitorFields(row, asOfMs = Date.now()) {
  const live = row.live || null;
  const online = live?.online ?? (row.helionStatus === 'connected');

  let fuelLitres = live?.fuel;
  let fuelAt = live?.gpsTime || row.fuel?.lastAt || row.lastGpsUploadAt;
  if (fuelLitres == null && row.fuel?.endL != null) fuelLitres = row.fuel.endL;
  if (!fuelAt && row.fuel?.lastAt) fuelAt = row.fuel.lastAt;

  const fuelAge = ageSecondsFromNow(fuelAt, asOfMs);
  const fuelLevel = stalenessLevel(fuelAge, FUEL_WARN_SEC, FUEL_ERR_SEC);
  row.fuelDisplay = {
    litres: fuelLitres != null ? Math.round(fuelLitres * 10) / 10 : null,
    updatedAt: fuelAt || null,
    ageLabel: fuelAge != null ? formatDurationShort(fuelAge) : 'Never',
    stale: fuelLevel === 'warn' || fuelLevel === 'error',
    status: !fuelLitres && fuelLitres !== 0 ? 'none' : fuelLevel,
  };

  const gprsAt = row.connectivity?.lastGpsAt || live?.gpsTime || row.lastGpsUploadAt;
  const gprsAge = ageSecondsFromNow(gprsAt, asOfMs);
  const gprsLevel = stalenessLevel(gprsAge, GPRS_WARN_SEC, GPRS_ERR_SEC);
  const speed = live?.speed != null ? Number(live.speed) : null;
  const moving = speed != null ? speed >= 3 : null;
  row.gprsDisplay = {
    location: row.gprsLocation || pickLocationName(live) || '—',
    updatedAt: gprsAt || null,
    ageLabel: gprsAge != null ? formatDurationShort(gprsAge) : 'Never',
    stale: gprsLevel === 'warn' || gprsLevel === 'error',
    status: !gprsAt ? 'none' : gprsLevel,
    lat: live?.lat ?? null,
    lng: live?.lng ?? null,
    speed,
    moving,
  };

  const offSecs = row.offlineDurationSecs || 0;
  const neverGps = !gprsAt && !row.connectivity?.lastGpsMs;
  row.antennaDisplay = {
    online,
    offlineSecs: offSecs,
    ageLabel: neverGps
      ? 'Never updated'
      : !online && offSecs > 0
        ? formatDurationShort(offSecs)
        : online
          ? 'Online'
          : '—',
    neverUpdated: neverGps,
    status: neverGps ? 'error' : !online && offSecs >= 3600 ? 'error' : !online ? 'warn' : 'ok',
  };

  row.monitorRefreshedAt = new Date(asOfMs).toISOString();
  return row;
}

async function enrichMonitorFieldsAsync(row, asOfMs = Date.now()) {
  const live = row.live;
  if (live?.lat != null && live?.lng != null && !row.gprsLocation) {
    const ps = live.ps != null ? String(live.ps).trim() : '';
    if (!ps || /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/.test(ps)) {
      const name = await geocode.resolve(live.lat, live.lng);
      if (name) row.gprsLocation = name;
    }
  }
  return enrichMonitorFields(row, asOfMs);
}

module.exports = {
  enrichMonitorFields,
  enrichMonitorFieldsAsync,
  pickLocationName,
};
