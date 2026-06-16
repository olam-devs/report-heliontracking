const fs = require('fs');
const path = require('path');
const { normalizeFuelPoints, detectFuelEvents } = require('./lib/utils/fuel-analyze');
const geocode = require('./lib/utils/geocode-cache');
const { isInvalidCoord, isValidCoord, findNextValidPoint, findSeriesIndex } = require('./coord-utils');
const {
  haversineKm,
  pathDistanceKm,
  googleMapsPoint,
  googleMapsRoute,
  formatDuration,
  theftLevel,
  STALE_CONTEXT_LABELS,
} = require('./geo');

const NOTIF_FILE = path.join(__dirname, '../../data/tracking/notifications.json');
const NOTIFICATION_MIN_LITRES = 10;
/** Fuel at/below this = sensor dead, tampered, or not reporting (e.g. 0L). */
const MIN_VALID_FUEL_L = 5;
const NOTIFICATION_KINDS = new Set(['fuel_drop', 'offline_return_theft']);

function isTamperFuel(fuel) {
  if (fuel == null) return true;
  const f = Number(fuel);
  return !Number.isFinite(f) || f <= MIN_VALID_FUEL_L;
}

function findRecoveryFuelPoint(series, afterTime) {
  if (!series?.length || afterTime == null) return null;
  for (const p of series) {
    if (p.time <= afterTime) continue;
    if (!isTamperFuel(p.fuel)) return p;
  }
  return null;
}

function findNextValidGpsAndFuelPoint(series, afterTime) {
  if (!series?.length || afterTime == null) return null;
  for (const p of series) {
    if (p.time <= afterTime) continue;
    if (!isTamperFuel(p.fuel) && isValidCoord(p.lat, p.lng)) return p;
  }
  return null;
}

function findPrevValidGpsAndFuelPoint(series, beforeTime) {
  if (!series?.length || beforeTime == null) return null;
  for (let i = series.length - 1; i >= 0; i--) {
    const p = series[i];
    if (p.time >= beforeTime) continue;
    if (!isTamperFuel(p.fuel) && isValidCoord(p.lat, p.lng)) return p;
  }
  return null;
}

/**
 * Notifications only when fuel sensor is working again.
 *
 * Point definitions:
 * - A: point before the drop (valid fuel)
 * - B: first point where fuel is back to valid (recovery). GPS may be invalid → mark B unknown.
 * - C: next point after B where both GPS + fuel are valid (only when B GPS invalid)
 */
function prepareNotificationDrop(drop, series) {
  if (!series?.length) return null;

  const fromPoint = drop.fromPoint;
  const rawTo = drop.toPoint;

  // If the "after" fuel is tampered (0L), defer until recovery (fuel is valid again).
  if (isTamperFuel(drop.fuelAfter)) {
    const recovery = findRecoveryFuelPoint(series, drop.time);
    if (!recovery) return null;

    const litres = Math.round((drop.fuelBefore - recovery.fuel) * 10) / 10;
    if (litres < NOTIFICATION_MIN_LITRES) return null;

    const bGpsInvalid = isInvalidCoord(recovery.lat, recovery.lng);
    const pointC = bGpsInvalid ? findNextValidGpsAndFuelPoint(series, recovery.time) : null;
    if (bGpsInvalid && !pointC) return null;

    return {
      ...drop,
      litres,
      fuelAfter: recovery.fuel,
      fromPoint,
      // B = recovery point (fuel valid), GPS might be invalid but fuel must be real.
      toPoint: { ...recovery, unknown: bGpsInvalid },
      deferredTamper: true,
      pointCHint: pointC ? { ...pointC } : null,
      // Keep "at" as the recovery time so newest ordering matches the moment fuel came back.
      at: recovery.timeStr || new Date(recovery.time).toISOString(),
      time: recovery.time,
    };
  }

  // Normal drop where fuelAfter is valid: B stays as the toPoint from the drop.
  // If B GPS invalid, we still keep B fuel (valid) and add C as next valid GPS+fuel.
  const bGpsInvalid = isInvalidCoord(rawTo?.lat, rawTo?.lng);
  const pointC = bGpsInvalid ? findNextValidGpsAndFuelPoint(series, rawTo?.time) : null;
  if (bGpsInvalid && !pointC) return null;
  return bGpsInvalid ? { ...drop, pointCHint: pointC } : drop;
}

function loadNotifications() {
  try {
    if (fs.existsSync(NOTIF_FILE)) {
      return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
    }
  } catch (_) {}
  return { items: [] };
}

function saveNotifications(store) {
  const dir = path.dirname(NOTIF_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(NOTIF_FILE + '.tmp', JSON.stringify(store, null, 2));
  fs.renameSync(NOTIF_FILE + '.tmp', NOTIF_FILE);
}

function isCalibrated(meta) {
  if (!meta) return true;
  if (meta.fuelCalibrated === false || meta.fuelSensorCalibrated === false) return false;
  return true;
}

async function enrichPoint(pt, { unknown = false } = {}) {
  if (!pt) return null;
  if (unknown || pt.unknown || isInvalidCoord(pt.lat, pt.lng)) {
    return {
      ...pt,
      unknown: true,
      placeName: 'Unknown location',
      map: null,
      mapsUrl: null,
    };
  }
  const lat = pt.lat;
  const lng = pt.lng;
  const name = lat != null && lng != null
    ? (geocode.resolveSync(lat, lng) || (await geocode.resolve(lat, lng)))
    : null;
  const map = googleMapsPoint(lat, lng, name);
  return {
    ...pt,
    unknown: false,
    placeName: name || (lat != null ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : null),
    map,
    mapsUrl: map?.url || null,
  };
}

function segmentMetrics(fromPt, toPt) {
  if (!fromPt || !toPt) return null;
  const fuelUsed = fromPt.fuel != null && toPt.fuel != null
    ? (isTamperFuel(toPt.fuel)
      ? Math.round(fromPt.fuel * 10) / 10
      : Math.round((fromPt.fuel - toPt.fuel) * 10) / 10)
    : null;
  const bothCoords = isValidCoord(fromPt.lat, fromPt.lng) && isValidCoord(toPt.lat, toPt.lng);
  const km = bothCoords ? haversineKm(fromPt, toPt) : null;
  const durationMs = fromPt.time && toPt.time ? toPt.time - fromPt.time : null;
  return {
    fuelUsed,
    distanceKm: km,
    duration: formatDuration(durationMs),
    durationMs,
    mapsRouteUrl: bothCoords ? googleMapsRoute(fromPt, toPt) : null,
  };
}

function resolveDropPoints(drop, series) {
  let fromPoint = { ...drop.fromPoint };
  let toPoint = { ...drop.toPoint };
  let pointC = drop.pointCHint ? { ...drop.pointCHint } : null;
  let pointA0 = null;

  // If A has invalid GPS or invalid fuel, backtrack to last point with GPS+fuel valid.
  const aGpsInvalid = isInvalidCoord(fromPoint.lat, fromPoint.lng);
  const aFuelInvalid = isTamperFuel(fromPoint.fuel);
  if (aGpsInvalid || aFuelInvalid) {
    const prev = findPrevValidGpsAndFuelPoint(series, fromPoint.time);
    if (prev) pointA0 = { ...prev };
    // A becomes "unknown" (bad GPS) but keep a valid fuel reading if possible.
    fromPoint = {
      ...fromPoint,
      unknown: aGpsInvalid,
      fuel: aFuelInvalid && prev ? prev.fuel : fromPoint.fuel,
    };
  }

  const toInvalid = isInvalidCoord(toPoint.lat, toPoint.lng);
  if (toInvalid) {
    // GPS invalid, but fuel may be valid (we still show it).
    toPoint = { ...toPoint, unknown: true };
    if (!pointC) {
      const idx = findSeriesIndex(series, drop.toPoint);
      const next = findNextValidGpsAndFuelPoint(series, drop.toPoint?.time ?? (idx >= 0 ? series[idx]?.time : null));
      if (next) pointC = { ...next };
    }
  }
  return { pointA0, fromPoint, toPoint, pointC, toInvalid };
}

function attachMapLinks(alert) {
  const from = alert.from;
  const to = alert.to;
  return {
    ...alert,
    mapsFromUrl: from?.mapsUrl || from?.map?.url || null,
    mapsToUrl: to?.mapsUrl || to?.map?.url || null,
    mapsRouteUrl: googleMapsRoute(from, to),
    reportDate: String(alert.at || '').slice(0, 10) || null,
  };
}

async function buildDropAlert({ devIdno, plate, drop, kind = 'fuel_drop', extra = {}, series = null }) {
  const resolved = series ? resolveDropPoints(drop, series) : {
    pointA0: null,
    fromPoint: drop.fromPoint,
    toPoint: drop.toPoint,
    pointC: null,
    toInvalid: isInvalidCoord(drop.toPoint?.lat, drop.toPoint?.lng),
  };
  const pointA0 = resolved.pointA0 ? await enrichPoint(resolved.pointA0) : null;
  const from = await enrichPoint(resolved.fromPoint, { unknown: resolved.fromPoint?.unknown });
  const to = await enrichPoint(resolved.toPoint, { unknown: resolved.toInvalid });
  const pointC = resolved.pointC ? await enrichPoint(resolved.pointC) : null;

  const rawA = resolved.fromPoint;
  const rawB = resolved.toPoint;
  const rawC = resolved.pointC;
  const rawA0 = resolved.pointA0;

  const segments = {
    a0ToA: rawA0 ? segmentMetrics(rawA0, rawA) : null,
    aToB: segmentMetrics(rawA, rawB),
    aToC: rawC ? segmentMetrics(rawA, rawC) : null,
    bToC: rawC ? segmentMetrics(rawB, rawC) : null,
    a0ToC: rawA0 && rawC ? segmentMetrics(rawA0, rawC) : null,
  };

  let km = segments.aToB?.distanceKm;
  if (km == null && !resolved.toInvalid && isValidCoord(rawB.lat, rawB.lng)) {
    km = pathDistanceKm([rawA, rawB]) ?? haversineKm(from, to);
  }
  if (km == null && rawC && segments.aToC?.distanceKm != null) {
    km = segments.aToC.distanceKm;
  }
  if (km == null && rawA0 && rawC && segments.a0ToC?.distanceKm != null) {
    km = segments.a0ToC.distanceKm;
  }
  let timeMs = segments.aToB?.durationMs ?? (
    drop.fromPoint?.time && drop.toPoint?.time ? drop.toPoint.time - drop.fromPoint.time : null
  );
  if (drop.deferredTamper && drop.recoveryPoint?.time && drop.fromPoint?.time) {
    timeMs = drop.recoveryPoint.time - drop.fromPoint.time;
  }
  if (rawA0 && rawC && segments.a0ToC?.durationMs != null) {
    // Total driving window when we have a complete valid path anchor (A0) and valid end (C).
    timeMs = segments.a0ToC.durationMs;
  }
  const severity = theftLevel(drop.litres);
  const alert = attachMapLinks({
    id: `${devIdno}-${drop.time}-${kind}`,
    kind,
    devIdno,
    plate,
    litres: drop.litres,
    fuelBefore: drop.fuelBefore,
    fuelAfter: drop.fuelAfter,
    at: drop.timeStr || new Date(drop.time).toISOString(),
    severity: severity.level,
    severityLabel: severity.label,
    pointA0,
    from,
    to,
    pointC,
    segments,
    distanceKm: km,
    duration: formatDuration(timeMs),
    durationMs: timeMs,
    theft: {
      fromLabel: 'A',
      toLabel: 'B',
      litres: drop.litres,
      fuelBefore: from?.fuel ?? drop.fuelBefore,
      fuelAfter: to?.fuel ?? drop.fuelAfter,
      at: drop.timeStr || new Date(drop.time).toISOString(),
    },
    createdAt: new Date().toISOString(),
    ...extra,
  });
  if (pointC) {
    alert.mapsPointCUrl = pointC.mapsUrl || pointC.map?.url || null;
    if (segments.aToC?.mapsRouteUrl) alert.mapsRouteAtoCUrl = segments.aToC.mapsRouteUrl;
    if (segments.bToC?.mapsRouteUrl) alert.mapsRouteBtoCUrl = segments.bToC.mapsRouteUrl;
  }
  return alert;
}

/**
 * Detect fuel sensor frozen periods — parked, driving, offline, or return after tamper.
 */
function detectStaleSensorAlerts(series, {
  fuelTolerance = 0.5,
  minDurationMin = 15,
  offlineGapMin = 30,
  parkedSpeedMax = 3,
  drivingSpeedMin = 8,
  minPathKm = 1.5,
} = {}) {
  const alerts = [];
  if (series.length < 2) return alerts;

  const offlineGapMs = offlineGapMin * 60000;
  const minDurationMs = minDurationMin * 60000;

  let i = 0;
  while (i < series.length - 1) {
    const start = series[i];
    let j = i + 1;

    while (
      j < series.length
      && Math.abs((series[j].fuel || 0) - (start.fuel || 0)) < fuelTolerance
    ) {
      j++;
    }

    const endIdx = j - 1;
    if (endIdx <= i) {
      i += 1;
      continue;
    }

    const block = series.slice(i, endIdx + 1);
    const end = series[endIdx];
    let resume = end;
    let gapAfterMs = 0;

    if (j < series.length) {
      gapAfterMs = series[j].time - end.time;
      if (gapAfterMs >= offlineGapMs) {
        resume = series[j];
      } else if (Math.abs((series[j].fuel || 0) - (start.fuel || 0)) >= fuelTolerance) {
        resume = series[j];
      }
    }

    const durationMs = resume.time - start.time;
    if (durationMs < minDurationMs) {
      i = j;
      continue;
    }

    let gapInsideMs = 0;
    for (let k = i + 1; k <= endIdx; k++) {
      const g = series[k].time - series[k - 1].time;
      if (g > gapInsideMs) gapInsideMs = g;
    }

    const maxSpeed = Math.max(...block.map((p) => p.speed || 0));
    const avgSpeed = block.reduce((s, p) => s + (p.speed || 0), 0) / block.length;
    const pathKm = pathDistanceKm(block) ?? haversineKm(start, end);
    const hadOffline = gapInsideMs >= offlineGapMs || gapAfterMs >= offlineGapMs;
    const fuelChangedOnResume = Math.abs((resume.fuel || 0) - (start.fuel || 0)) >= fuelTolerance;

    let context = 'parked_stale';
    if (hadOffline && gapAfterMs >= offlineGapMs && fuelChangedOnResume) {
      context = 'offline_return_stale';
    } else if (hadOffline) {
      context = 'offline_stale';
    } else if (maxSpeed >= drivingSpeedMin || (pathKm != null && pathKm >= minPathKm)) {
      context = fuelChangedOnResume && resume !== end
        ? 'tamper_resume_driving'
        : 'driving_stale';
    } else if (avgSpeed <= parkedSpeedMax) {
      context = fuelChangedOnResume && resume !== end
        ? 'tamper_resume_parked'
        : 'parked_stale';
    }

    const movingWhileFrozen = maxSpeed >= drivingSpeedMin && pathKm != null && pathKm >= minPathKm;
    if (!movingWhileFrozen && !hadOffline && durationMs < minDurationMs * 1.5 && !fuelChangedOnResume) {
      i = j;
      continue;
    }

    alerts.push({
      kind: 'stale_sensor',
      context,
      contextLabel: STALE_CONTEXT_LABELS[context] || context,
      at: resume.timeStr || end.timeStr,
      litresFrozen: start.fuel,
      litresResumed: resume.fuel,
      fromPoint: start,
      toPoint: resume,
      distanceKm: pathDistanceKm([start, ...block.slice(1), resume]) ?? pathKm,
      duration: formatDuration(durationMs),
      durationMs,
      offlineGapMs: hadOffline ? Math.max(gapInsideMs, gapAfterMs) : null,
      offlineGapLabel: hadOffline ? formatDuration(Math.max(gapInsideMs, gapAfterMs)) : null,
      maxSpeedKmh: Math.round(maxSpeed),
      parked: avgSpeed <= parkedSpeedMax,
      driving: movingWhileFrozen,
    });

    i = j;
  }

  return alerts;
}

function detectOfflineReturnTheft(series, { offlineGapMin = 30, minDropL = 5 } = {}) {
  const alerts = [];
  const offlineGapMs = offlineGapMin * 60000;
  for (let i = 1; i < series.length; i++) {
    const gap = series[i].time - series[i - 1].time;
    if (gap < offlineGapMs) continue;
    const offlinePt = series[i - 1];
    const onlinePt = series[i];
    const fuelDrop = (offlinePt.fuel || 0) - (onlinePt.fuel || 0);
    if (fuelDrop < minDropL) continue;
    alerts.push({
      time: onlinePt.time,
      timeStr: onlinePt.timeStr,
      litres: Math.round(fuelDrop * 10) / 10,
      fuelBefore: offlinePt.fuel,
      fuelAfter: onlinePt.fuel,
      fromPoint: offlinePt,
      toPoint: onlinePt,
      offlineGapMs: gap,
      offlineGapLabel: formatDuration(gap),
    });
  }
  return alerts;
}

function isSeriousTheftAlert(a) {
  if (!NOTIFICATION_KINDS.has(a.kind)) return false;
  if (a.litres != null && a.litres < NOTIFICATION_MIN_LITRES) return false;
  return true;
}

function parseAlertTime(a) {
  const s = String(a.at || '');
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

async function analyzeVehicleTracks({
  devIdno,
  plate,
  tracks,
  dropThresholdL = 20,
  mode = 'fuel_alerts',
  vehicleMeta = null,
}) {
  if (!isCalibrated(vehicleMeta)) {
    return {
      devIdno,
      plate,
      skipped: true,
      reason: 'fuel_sensor_not_calibrated',
      alerts: [],
    };
  }

  const forNotifications = mode === 'notifications';
  const dropL = forNotifications
    ? NOTIFICATION_MIN_LITRES
    : Math.max(1, Number(dropThresholdL) || 20);
  const offlineMinL = forNotifications ? NOTIFICATION_MIN_LITRES : dropL;

  const series = normalizeFuelPoints({ infos: tracks });
  const drops = detectFuelEvents(series, dropL, dropL).filter((e) => e.type === 'drop');
  const alerts = [];

  for (const d of drops) {
    if (forNotifications && d.litres < NOTIFICATION_MIN_LITRES) continue;
    const prepared = forNotifications ? prepareNotificationDrop(d, series) : d;
    if (forNotifications && !prepared) continue;
    alerts.push(await buildDropAlert({ devIdno, plate, drop: prepared, kind: 'fuel_drop', series }));
  }

  for (const off of detectOfflineReturnTheft(series, { minDropL: offlineMinL })) {
    if (forNotifications && off.litres < NOTIFICATION_MIN_LITRES) continue;
    const prepared = forNotifications ? prepareNotificationDrop(off, series) : off;
    if (forNotifications && !prepared) continue;
    alerts.push(await buildDropAlert({
      devIdno,
      plate,
      drop: prepared,
      kind: 'offline_return_theft',
      series,
      extra: {
        offlineGapMs: off.offlineGapMs,
        offlineGapLabel: off.offlineGapLabel,
        severityLabel: theftLevel(off.litres).label + ' (after offline)',
      },
    }));
  }

  if (forNotifications) {
    return { devIdno, plate, skipped: false, alerts };
  }

  for (const stale of detectStaleSensorAlerts(series)) {
    const from = await enrichPoint(stale.fromPoint);
    const to = await enrichPoint(stale.toPoint);
    alerts.push(attachMapLinks({
      id: `${devIdno}-stale-${stale.toPoint?.time || stale.at}`,
      kind: 'stale_sensor',
      context: stale.context,
      contextLabel: stale.contextLabel,
      devIdno,
      plate,
      at: stale.at,
      litresFrozen: stale.litresFrozen,
      litresResumed: stale.litresResumed,
      from,
      to,
      distanceKm: stale.distanceKm,
      duration: stale.duration,
      durationMs: stale.durationMs,
      offlineGapMs: stale.offlineGapMs,
      offlineGapLabel: stale.offlineGapLabel,
      maxSpeedKmh: stale.maxSpeedKmh,
      severity: 'warning',
      severityLabel: stale.contextLabel,
      createdAt: new Date().toISOString(),
    }));
  }

  return { devIdno, plate, skipped: false, alerts };
}

/** Append-only: saved notifications never change once stored. */
function appendNotifications(existing, incoming) {
  const map = new Map((existing.items || []).map((n) => [n.id, n]));
  const newlyAdded = [];
  let added = 0;
  for (const n of incoming) {
    if (!isSeriousTheftAlert(n)) continue;
    if (map.has(n.id)) continue;
    const saved = {
      ...n,
      savedAt: new Date().toISOString(),
    };
    map.set(n.id, saved);
    newlyAdded.push(saved);
    added += 1;
  }
  const items = [...map.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (newlyAdded.length) {
    try {
      const { registerDangerPointsFromAlerts } = require('./danger-zones.service');
      registerDangerPointsFromAlerts(newlyAdded);
    } catch (e) {
      console.error('[danger-zones] register failed:', e.message);
    }
  }
  return { items: items.slice(0, 10000), added };
}

function mergeNotifications(existing, incoming) {
  return appendNotifications(existing, incoming);
}

function purgeNotificationsForVehicle(devIdno) {
  const store = loadNotifications();
  const id = String(devIdno);
  const before = (store.items || []).length;
  store.items = (store.items || []).filter((a) => String(a.devIdno) !== id);
  const removed = before - store.items.length;
  if (removed > 0) saveNotifications(store);
  return removed;
}

function purgeAllUncalibratedNotifications(getVehicleMeta) {
  if (!getVehicleMeta) return 0;
  const store = loadNotifications();
  const before = (store.items || []).length;
  store.items = (store.items || []).filter((a) => isCalibrated(getVehicleMeta(a.devIdno)));
  const removed = before - store.items.length;
  if (removed > 0) saveNotifications(store);
  return removed;
}

/** Remove stored alerts with dead-sensor 0L reads or 0,0 GPS shown as real locations. */
function purgeMalformedNotifications() {
  const store = loadNotifications();
  const before = (store.items || []).length;
  store.items = (store.items || []).filter((a) => {
    if (!NOTIFICATION_KINDS.has(a.kind)) return true;
    if (a.fuelAfter != null && isTamperFuel(a.fuelAfter)) return false;
    const to = a.to || {};
    if (!to.unknown && isInvalidCoord(to.lat, to.lng)) return false;
    return true;
  });
  const removed = before - store.items.length;
  if (removed > 0) saveNotifications(store);
  return removed;
}

function filterCalibratedAlerts(items, getVehicleMeta) {
  if (!getVehicleMeta) return items || [];
  return (items || []).filter((a) => isCalibrated(getVehicleMeta(a.devIdno)));
}

function countUnread(items, userId, getLastSeen, getVehicleMeta = null) {
  let list = items || [];
  if (getVehicleMeta) list = filterCalibratedAlerts(list, getVehicleMeta);
  const lastSeen = getLastSeen(userId);
  const lastMs = lastSeen ? new Date(lastSeen).getTime() : 0;
  return list.filter((a) => {
    if (!isSeriousTheftAlert(a)) return false;
    const t = new Date(a.savedAt || a.createdAt || a.at).getTime();
    return !Number.isNaN(t) && t > lastMs;
  }).length;
}

function normPlate(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

function alertDate(a) {
  return String(a.reportDate || a.at || '').slice(0, 10);
}

/**
 * Search stored alerts.
 * - `date` → all vehicles on that single day
 * - `plate` / `devIdno` → optional vehicle filter
 * - `from` + `to` → date range (when `date` not set)
 */
function parseQueryTime(str, endOfDay = false) {
  const s = String(str || '').trim();
  if (!s) return null;
  if (s.includes('T') || /^\d{4}-\d{2}-\d{2}\s+\d{2}:/.test(s)) {
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const day = s.slice(0, 10);
  if (endOfDay) return new Date(`${day}T23:59:59`).getTime();
  return new Date(`${day}T00:00:00`).getTime();
}

function searchAlerts({ items, devIdno, plate, from, to, date, fromTs, toTs, kinds, seriousOnly = true, getVehicleMeta = null }) {
  let out = items || [];

  if (seriousOnly) {
    out = out.filter(isSeriousTheftAlert);
  }

  if (getVehicleMeta) {
    out = filterCalibratedAlerts(out, getVehicleMeta);
  }

  if (devIdno) {
    out = out.filter((a) => String(a.devIdno) === String(devIdno));
  }
  if (plate) {
    const q = normPlate(plate);
    out = out.filter((a) => normPlate(a.plate).includes(q));
  }

  const fromMs = fromTs != null
    ? parseQueryTime(fromTs, false)
    : date
      ? parseQueryTime(date, false)
      : from
        ? parseQueryTime(from, false)
        : null;
  const toMs = toTs != null
    ? parseQueryTime(toTs, false)
    : date
      ? parseQueryTime(date, true)
      : to
        ? parseQueryTime(to, true)
        : null;

  if (fromMs != null || toMs != null) {
    out = out.filter((a) => {
      const t = parseAlertTime(a);
      if (t == null) return false;
      if (fromMs != null && t < fromMs) return false;
      if (toMs != null && t > toMs) return false;
      return true;
    });
  }

  if (kinds?.length) {
    out = out.filter((a) => kinds.includes(a.kind));
  }

  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

module.exports = {
  analyzeVehicleTracks,
  loadNotifications,
  saveNotifications,
  appendNotifications,
  mergeNotifications,
  purgeNotificationsForVehicle,
  purgeAllUncalibratedNotifications,
  purgeMalformedNotifications,
  filterCalibratedAlerts,
  isTamperFuel,
  MIN_VALID_FUEL_L,
  searchAlerts,
  countUnread,
  isSeriousTheftAlert,
  isCalibrated,
  NOTIFICATION_MIN_LITRES,
  NOTIFICATION_KINDS,
  STALE_CONTEXT_LABELS,
};
