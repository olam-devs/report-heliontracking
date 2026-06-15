/**
 * Daily fleet inspection — mirrors Helion_Daily_Report(ALL VEHICLES).xlsx columns.
 * Cameras = manual; fuel / GPRS / antenna (offline) / Helion status = CMS-derived.
 */

const { detectFuelEvents } = require('./fuel-analyze');
const cameraManual = require('./camera-manual');

const GPRS_STALE_MS = 2 * 60 * 60 * 1000; // 2h without GPS → GPRS issue
const TRACK_GAP_MS = 5 * 60 * 1000; // 5 min gap counts as offline spell
const NOT_ACTIVE_OFFLINE_SECS = 48 * 3600; // 2+ days offline → "Not Active" style

function parseGpsTime(gt) {
  if (!gt) return null;
  const ts = new Date(String(gt).replace(' ', 'T')).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function formatOfflineLabel(secs) {
  if (!secs || secs < 3600) return null;
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  if (days >= 1) return `Antenna ${days}D`;
  if (hours >= 1) return `Antenna ${hours}h`;
  return `Antenna ${Math.round(secs / 60)}m`;
}

/**
 * From GPS track points (scaled), find connectivity gaps and last fix.
 */
function analyzeGpsTrack(tracks = [], opts = {}) {
  const asOfMs = opts.asOfMs != null ? opts.asOfMs : Date.now();
  const historicalDay = !!opts.historicalDay;

  const times = tracks
    .map((t) => parseGpsTime(t.gpsTime || t.gt))
    .filter((x) => x != null)
    .sort((a, b) => a - b);

  if (!times.length) {
    return {
      gprsOk: false,
      lastGpsAt: null,
      lastGpsMs: null,
      maxOfflineGapSecs: null,
      offlineSpells: [],
    };
  }

  let maxGap = 0;
  const spells = [];
  for (let i = 1; i < times.length; i++) {
    const gapMs = times[i] - times[i - 1];
    if (gapMs > TRACK_GAP_MS) {
      const gapSecs = Math.round(gapMs / 1000);
      if (gapSecs > maxGap) maxGap = gapSecs;
      spells.push({
        from: new Date(times[i - 1]).toISOString(),
        to: new Date(times[i]).toISOString(),
        durationSecs: gapSecs,
        label: formatOfflineLabel(gapSecs),
      });
    }
  }

  const lastGpsMs = times[times.length - 1];
  const stale = asOfMs - lastGpsMs > GPRS_STALE_MS;
  const gprsOk = historicalDay
    ? times.length >= 2 && maxGap < GPRS_STALE_MS / 1000
    : !stale && times.length >= 2;

  return {
    gprsOk,
    lastGpsAt: new Date(lastGpsMs).toISOString(),
    lastGpsMs,
    maxOfflineGapSecs: maxGap || null,
    offlineSpells: spells.sort((a, b) => b.durationSecs - a.durationSecs),
  };
}

function assessFuelSensor(fuelSeries, fuelEvents, dropThresholdL) {
  if (!fuelSeries?.length) {
    return { ok: false, reason: 'No fuel readings in period' };
  }
  const drops = (fuelEvents || []).filter((e) => e.type === 'drop');
  if (!drops.length) {
    return { ok: true, reason: 'Fuel sensor reporting normally' };
  }
  const worst = drops.reduce((a, b) => (b.litres > a.litres ? b : a), drops[0]);
  return {
    ok: false,
    reason: `Sharp drop −${worst.litres} L at ${worst.timeStr || ''}`,
    drops,
  };
}

function buildIssueList({
  helionStatus,
  gprsOk,
  fuelOk,
  antennaOk,
  offlineLabel,
  camerasOk,
  cameraStatus,
  manualNotes,
  fuelDrops,
  offlineSpells,
  alarmCount,
}) {
  const issues = [];
  const at = new Date().toISOString();

  if (helionStatus === 'not_active') {
    issues.push({ code: 'not_active', message: 'Helion: N/A Not Active', at, severity: 'high' });
  } else if (helionStatus === 'offline') {
    issues.push({ code: 'offline', message: offlineLabel || 'Device offline', at, severity: 'high' });
  }

  if (gprsOk === false) {
    issues.push({ code: 'gprs', message: 'GPRS / GPS data missing or stale', at, severity: 'medium' });
  }

  if (fuelOk === false && fuelDrops?.length) {
    for (const d of fuelDrops.slice(0, 3)) {
      issues.push({
        code: 'fuel_drop',
        message: `Fuel drop −${d.litres} L at ${d.timeStr || ''}`,
        at: d.time ? new Date(d.time).toISOString() : at,
        severity: 'high',
      });
    }
  } else if (fuelOk === false) {
    issues.push({ code: 'fuel_sensor', message: 'Fuel sensor not reporting', at, severity: 'medium' });
  }

  if (antennaOk === false && offlineLabel) {
    issues.push({ code: 'antenna', message: offlineLabel, at, severity: 'high' });
  }

  if (camerasOk === false) {
    const camMsg =
      cameraStatus?.badChannels?.length
        ? `Cameras: maintenance Cam ${cameraStatus.badChannels.join(', ')}`
        : manualNotes?.match(/cam/i)
          ? manualNotes
          : 'Camera issue (manual)';
    issues.push({ code: 'cameras', message: camMsg, at, severity: 'medium' });
  }

  if (alarmCount > 0) {
    issues.push({ code: 'alarms', message: `${alarmCount} alarm(s) in period`, at, severity: 'low' });
  }

  for (const spell of (offlineSpells || []).slice(0, 2)) {
    if (spell.durationSecs >= 3600) {
      issues.push({
        code: 'offline_spell',
        message: `${spell.label || 'Offline gap'} (${spell.from?.slice(0, 16)} – ${spell.to?.slice(0, 16)})`,
        at: spell.from || at,
        severity: 'medium',
      });
    }
  }

  return issues;
}

function buildAutoNotesText({
  helionStatus,
  offlineLabel,
  gprsOk,
  fuelAssessment,
  fuelSeries,
  connectivity,
  alarmCount,
}) {
  const parts = [];
  if (helionStatus === 'connected') parts.push('Helion: Connected');
  else if (helionStatus === 'not_active') parts.push('Helion: N/A Not Active');
  else parts.push('Helion: Offline');

  if (offlineLabel) parts.push(offlineLabel);
  if (gprsOk === false) parts.push('GPRS/GPS stale or no track');
  else if (connectivity?.lastGpsAt) parts.push(`Last GPS: ${connectivity.lastGpsAt.slice(0, 19).replace('T', ' ')}`);

  if (fuelAssessment?.ok) parts.push('Fuel sensor OK');
  else if (fuelAssessment?.reason) parts.push(fuelAssessment.reason);

  if (fuelSeries?.length >= 2) {
    const start = fuelSeries[0].fuel;
    const end = fuelSeries[fuelSeries.length - 1].fuel;
    parts.push(`Fuel ${start}→${end} L`);
  }

  if (alarmCount > 0) parts.push(`${alarmCount} alarms`);

  return parts.join('. ') + (parts.length ? '.' : '');
}

/**
 * Build one inspection row (Excel-shaped).
 */
function buildInspectionRow({
  vehicle,
  liveStatus,
  fuelSeries,
  fuelEvents,
  connectivity,
  uptimeSummary,
  dropThresholdL,
  reportDate,
  manual = {},
}) {
  const devIdno = String(vehicle.devIdno || vehicle.id || '');
  const plate = vehicle.plate || vehicle.nm || devIdno;
  const sim = vehicle.dl?.[0]?.sim ?? vehicle.sim ?? null;
  const online = (liveStatus?.ol ?? liveStatus?.online ?? 0) !== 0;

  const offlineNowSecs = uptimeSummary?.offlineNowSecs
    ?? (liveStatus && !online && uptimeSummary?.last?.offlineSinceTs
      ? Math.max(0, Math.round((Date.now() - uptimeSummary.last.offlineSinceTs) / 1000))
      : 0);

  const maxGap = connectivity?.maxOfflineGapSecs || 0;
  const dominantOfflineSecs = Math.max(offlineNowSecs, maxGap);

  let helionStatus = 'connected';
  if (!online && offlineNowSecs >= NOT_ACTIVE_OFFLINE_SECS) helionStatus = 'not_active';
  else if (!online) helionStatus = 'offline';
  else if (!connectivity?.gprsOk && !connectivity?.lastGpsMs) helionStatus = 'offline';

  const offlineLabel = formatOfflineLabel(dominantOfflineSecs)
    || connectivity?.offlineSpells?.[0]?.label
    || null;

  const antennaOk = online || dominantOfflineSecs < 86400;
  const gprsOk = connectivity?.gprsOk ?? (online && liveStatus?.gpsTime != null);

  const fuelAssessment = assessFuelSensor(fuelSeries, fuelEvents, dropThresholdL);
  const fuelSensorOk = fuelAssessment.ok;

  const camFromManual = cameraManual.toSummary(manual);
  const camerasOk = manual.camerasOk != null ? manual.camerasOk : camFromManual.ok;

  const autoNotes = buildAutoNotesText({
    helionStatus,
    offlineLabel,
    gprsOk,
    fuelAssessment,
    fuelSeries,
    connectivity,
    alarmCount: manual.alarmCount ?? 0,
  });

  const issues = buildIssueList({
    helionStatus,
    gprsOk,
    fuelOk: fuelSensorOk,
    antennaOk,
    offlineLabel,
    camerasOk,
    cameraStatus: camFromManual.status,
    manualNotes: manual.notes,
    fuelDrops: fuelEvents?.filter((e) => e.type === 'drop'),
    offlineSpells: connectivity?.offlineSpells,
    alarmCount: manual.alarmCount ?? 0,
  });

  return {
    devIdno,
    plate,
    sim: sim != null ? String(sim) : '',
    reportDate,
    camerasOk,
    fuelSensorOk,
    gprsOk,
    antennaOk,
    helionStatus,
    helionLabel:
      helionStatus === 'connected'
        ? 'Connected'
        : helionStatus === 'not_active'
          ? 'N/A Not Active'
          : 'Offline',
    offlineDurationSecs: dominantOfflineSecs || 0,
    offlineLabel,
    autoNotes,
    notes: manual.notes != null ? String(manual.notes) : '',
    issues,
    hasIssues: issues.length > 0 || camerasOk === false,
    connectivity,
    fuel: {
      startL: fuelSeries?.[0]?.fuel ?? null,
      endL: fuelSeries?.[fuelSeries.length - 1]?.fuel ?? null,
      lastAt:
        fuelSeries?.length
          ? fuelSeries[fuelSeries.length - 1].timeStr
          : liveStatus?.gpsTime || null,
      drops: (fuelEvents?.filter((e) => e.type === 'drop') || []).map((d) => ({
        ...d,
        time: d.time,
        timeStr: d.timeStr,
      })),
    },
    live: liveStatus
      ? {
          online,
          speed: liveStatus.speed,
          fuel: liveStatus.fuel,
          gpsTime: liveStatus.gpsTime,
          accOn: liveStatus.accOn,
          lat: liveStatus.lat,
          lng: liveStatus.lng,
          ps: liveStatus.ps != null ? String(liveStatus.ps) : null,
        }
      : null,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  parseGpsTime,
  formatOfflineLabel,
  analyzeGpsTrack,
  assessFuelSensor,
  buildInspectionRow,
  buildIssueList,
  GPRS_STALE_MS,
  NOT_ACTIVE_OFFLINE_SECS,
};
