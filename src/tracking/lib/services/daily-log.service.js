/**
 * daily-log.service.js — Fleet daily operations journal
 *
 * Manual entries (multiple per vehicle per day) + auto-generated CMS insights.
 * Persists to data/daily-log.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cms = require('./cmsv6.service');
const {
  normalizeFuelPoints,
  detectFuelEvents,
  totalConsumption,
  buildAutoNotes,
} = require('../utils/fuel-analyze');
const { analyzeGpsTrack, buildInspectionRow } = require('../utils/daily-inspection');
const { sortDailyReportRows } = require('../utils/daily-report-sort');
const { enrichMonitorFields, enrichMonitorFieldsAsync } = require('../utils/report-monitor-fields');
const cameraManual = require('../utils/camera-manual');
const { attachBundleFields } = require('../utils/bundle-meta');
const uptimeAnalytics = require('./uptime-analytics.service');

const FILE = process.env.DAILY_LOG_FILE || path.join(__dirname, '../../../../data/daily-log.json');
const TIMEZONE = process.env.FLEET_TIMEZONE || 'Africa/Dar_es_Salaam';

let store = {
  entries: [],
  /** @type {Record<string, object>} key: `${devIdno}_${reportDate}` — cameras/notes for that CMS snapshot day */
  inspections: {},
  /** @type {Record<string, object>} persistent per device */
  vehicleMeta: {},
  /** @type {Array} audit trail: cms_sync | manual_edit */
  syncLog: [],
  settings: { defaultDropThresholdL: 20 },
};

const MANUAL_META_FIELDS = [
  'vehicleComment',
  'simPhone',
  'driverPhone',
  'driverComment',
  'bundlePurchasedDate',
  'bundleDurationDays',
  'fuelCalibrated',
  'fuelSensorCalibrated',
];

function mergeVehicleMetaEntry(diskEntry, memEntry) {
  const disk = diskEntry || {};
  const mem = memEntry || {};
  const out = { ...disk, ...mem };
  for (const f of MANUAL_META_FIELDS) {
    const mv = mem[f];
    const dv = disk[f];
    if (mv != null && mv !== '') out[f] = mv;
    else if (dv != null && dv !== '') out[f] = dv;
    else if (mv !== undefined) out[f] = mv;
    else out[f] = dv ?? null;
  }
  return out;
}

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      store.entries = raw.entries || [];
      store.inspections = raw.inspections || {};
      store.vehicleMeta = raw.vehicleMeta || {};
      store.syncLog = raw.syncLog || [];
      store.settings = { ...store.settings, ...(raw.settings || {}) };
    }
  } catch (_) {}
}

/** Merge disk vehicleMeta into memory (multi-process: report portal + middleware share one file). */
function refreshVehicleMetaFromDisk() {
  try {
    if (!fs.existsSync(FILE)) return;
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const disk = raw.vehicleMeta || {};
    for (const [id, dm] of Object.entries(disk)) {
      store.vehicleMeta[id] = mergeVehicleMetaEntry(dm, store.vehicleMeta[id]);
    }
  } catch (_) {}
}

function save() {
  try {
    refreshVehicleMetaFromDisk();
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (_) {}
}

load();

function newId() {
  return `dlog_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function parseDateRange(from, to) {
  const f = String(from || todayStr()).slice(0, 10);
  const t = String(to || f).slice(0, 10);
  return {
    from: f,
    to: t,
    begintime: `${f} 00:00:00`,
    endtime: `${t} 23:59:59`,
  };
}

/** Normalize report / analytics period (from query or opts). */
function resolveReportPeriod(reportDate, opts = {}) {
  let from = String(opts.from || reportDate || todayStr()).slice(0, 10);
  let to = String(opts.to || opts.from || reportDate || from).slice(0, 10);
  if (to < from) {
    const swap = from;
    from = to;
    to = swap;
  }
  return {
    from,
    to,
    label: from === to ? from : `${from} → ${to}`,
    singleDay: from === to,
  };
}

function entryInRange(entry, from, to) {
  const d = String(entry.reportDate || entry.recordedAt?.slice(0, 10) || '');
  return d >= from && d <= to;
}

function listEntries({ from, to, devIdnos = null, plate = null }) {
  const range = parseDateRange(from, to);
  const idSet = devIdnos?.length ? new Set(devIdnos.map(String)) : null;
  let rows = store.entries.filter((e) => entryInRange(e, range.from, range.to));
  if (idSet) rows = rows.filter((e) => idSet.has(String(e.devIdno)));
  if (plate) {
    const p = String(plate).toLowerCase();
    rows = rows.filter((e) => String(e.plate || '').toLowerCase() === p);
  }
  rows.sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
  return rows;
}

function getEntry(id) {
  return store.entries.find((e) => e.id === id) || null;
}

function createEntry({
  devIdno,
  plate,
  manualNote = '',
  fields = {},
  reportDate,
  autoSnapshot = null,
  createdBy = null,
}) {
  const recordedAt = new Date().toISOString();
  const entry = {
    id: newId(),
    devIdno: String(devIdno || '').trim(),
    plate: String(plate || devIdno || '').trim(),
    reportDate: String(reportDate || recordedAt.slice(0, 10)),
    recordedAt,
    manualNote: String(manualNote || '').trim(),
    fields: fields && typeof fields === 'object' ? fields : {},
    autoSnapshot: autoSnapshot || null,
    createdBy: createdBy || null,
    updatedAt: recordedAt,
  };
  store.entries.push(entry);
  save();
  return entry;
}

function updateEntry(id, patch = {}) {
  const entry = getEntry(id);
  if (!entry) return null;
  if (patch.manualNote != null) entry.manualNote = String(patch.manualNote).trim();
  if (patch.fields != null) entry.fields = { ...entry.fields, ...patch.fields };
  if (patch.reportDate != null) entry.reportDate = String(patch.reportDate).slice(0, 10);
  entry.updatedAt = new Date().toISOString();
  save();
  return entry;
}

function deleteEntry(id) {
  const idx = store.entries.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  store.entries.splice(idx, 1);
  save();
  return true;
}

function getSettings() {
  return { ...store.settings };
}

function setSettings(patch) {
  if (patch.defaultDropThresholdL != null) {
    store.settings.defaultDropThresholdL = Math.max(1, Number(patch.defaultDropThresholdL) || 20);
  }
  save();
  return getSettings();
}

function inspectionKey(devIdno, reportDate) {
  return `${String(devIdno)}_${String(reportDate).slice(0, 10)}`;
}

function ensureVehicleMeta(devIdno, plate = '') {
  const id = String(devIdno);
  if (!store.vehicleMeta[id]) {
    store.vehicleMeta[id] = {
      devIdno: id,
      plate: String(plate || ''),
      bundlePurchasedDate: null,
      bundleDurationDays: null,
      simPhone: null,
      vehicleComment: null,
      driverPhone: null,
      driverComment: null,
      lastCmsSyncAt: null,
      lastManualEditAt: null,
      lastGpsUploadAt: null,
    };
  }
  if (plate) store.vehicleMeta[id].plate = String(plate);
  return store.vehicleMeta[id];
}

function getVehicleMeta(devIdno) {
  return store.vehicleMeta[String(devIdno)] || null;
}

function pushSyncLog(evt, persist = true) {
  store.syncLog.unshift({
    id: newId(),
    at: new Date().toISOString(),
    ...evt,
  });
  if (store.syncLog.length > 4000) store.syncLog.length = 4000;
  if (persist) save();
}

function getManualInspection(devIdno, reportDate) {
  return store.inspections[inspectionKey(devIdno, reportDate)] || {};
}

function saveManualInspection(devIdno, reportDate, patch = {}, createdBy = null) {
  const key = inspectionKey(devIdno, reportDate);
  const prev = store.inspections[key] || {};
  const now = new Date().toISOString();
  const meta = ensureVehicleMeta(devIdno, patch.plate || prev.plate);

  if (patch.bundlePurchasedDate !== undefined) {
    const d = patch.bundlePurchasedDate;
    meta.bundlePurchasedDate = d ? String(d).slice(0, 10) : null;
  }
  if (patch.bundleDurationDays !== undefined) {
    const n = parseInt(patch.bundleDurationDays, 10);
    meta.bundleDurationDays = Number.isFinite(n) && n > 0 ? n : null;
  }
  if (patch.simPhone !== undefined) {
    const p = String(patch.simPhone || '').trim();
    meta.simPhone = p || null;
  }
  if (patch.vehicleComment !== undefined) {
    const c = String(patch.vehicleComment || '').trim();
    meta.vehicleComment = c || null;
  }
  if (patch.driverPhone !== undefined) {
    const p = String(patch.driverPhone || '').trim();
    meta.driverPhone = p || null;
  }
  if (patch.driverComment !== undefined) {
    const c = String(patch.driverComment || '').trim();
    meta.driverComment = c || null;
  }
  if (patch.fuelCalibrated !== undefined) {
    meta.fuelCalibrated = !!patch.fuelCalibrated;
    meta.fuelSensorCalibrated = !!patch.fuelCalibrated;
  }
  if (patch.fuelSensorCalibrated !== undefined) {
    meta.fuelSensorCalibrated = !!patch.fuelSensorCalibrated;
    meta.fuelCalibrated = !!patch.fuelSensorCalibrated;
  }

  let cameraStatus = prev.cameraStatus
    ? cameraManual.normalizeCameraStatus(prev.cameraStatus)
    : cameraManual.normalizeCameraStatus({ camerasOk: prev.camerasOk });

  if (patch.cameraStatus !== undefined) {
    cameraStatus = cameraManual.normalizeCameraStatus(patch.cameraStatus);
  } else if (patch.camerasOk !== undefined) {
    cameraStatus = cameraManual.normalizeCameraStatus({
      camerasOk: patch.camerasOk,
      badChannels: patch.badChannels || prev.badChannels,
    });
  }

  const prevCamJson = JSON.stringify(
    cameraManual.normalizeCameraStatus(prev.cameraStatus || { camerasOk: prev.camerasOk }),
  );
  const newCamJson = JSON.stringify(cameraStatus);
  const cameraChanged =
    (patch.cameraStatus !== undefined || patch.camerasOk !== undefined) && prevCamJson !== newCamJson;

  store.inspections[key] = {
    ...prev,
    devIdno: String(devIdno),
    reportDate: String(reportDate).slice(0, 10),
    cameraStatus,
    camerasOk: cameraManual.deriveCamerasOk(cameraStatus),
    badChannels: cameraStatus.badChannels || [],
    notes: patch.notes !== undefined ? String(patch.notes) : prev.notes,
    lastCameraEditedBy: cameraChanged ? createdBy || prev.lastCameraEditedBy : prev.lastCameraEditedBy,
    lastCameraEditedAt: cameraChanged ? now : prev.lastCameraEditedAt,
    updatedAt: now,
  };

  meta.lastManualEditAt = now;
  save();

  const parts = [];
  if (cameraChanged) parts.push(`cameras=${cameraManual.toNote(cameraStatus) || cameraStatus.mode}`);
  if (patch.notes !== undefined) parts.push('day notes updated');
  if (patch.bundlePurchasedDate !== undefined || patch.bundleDurationDays !== undefined) {
    parts.push(`bundle=${meta.bundlePurchasedDate || '—'} / ${meta.bundleDurationDays || '?'}d`);
  }
  if (patch.simPhone !== undefined) parts.push('sim updated');
  if (patch.vehicleComment !== undefined) parts.push('tag updated');
  if (patch.driverPhone !== undefined || patch.driverComment !== undefined) parts.push('driver updated');

  if (parts.length) {
    pushSyncLog({
      devIdno: String(devIdno),
      plate: meta.plate,
      type: 'manual_edit',
      cmsReportDate: String(reportDate).slice(0, 10),
      summary: parts.join('; '),
      createdBy,
    });
  }

  if (cameraChanged) {
    createEntry({
      devIdno,
      plate: meta.plate,
      manualNote: cameraManual.toNote(cameraStatus) || 'Camera check',
      reportDate,
      fields: { type: 'cameras', cameraStatus, camerasOk: cameraManual.deriveCamerasOk(cameraStatus) },
      createdBy,
    });
  }

  return { inspection: store.inspections[key], vehicleMeta: meta };
}

function enrichRowFromMeta(row, devIdno, reportDate) {
  refreshVehicleMetaFromDisk();
  const meta = getVehicleMeta(devIdno) || {};
  const manual = getManualInspection(devIdno, reportDate);
  attachBundleFields(row, meta);
  row.vehicleComment = meta.vehicleComment || null;
  row.driverPhone = meta.driverPhone || null;
  row.driverComment = meta.driverComment || null;
  row.notes = manual.notes != null ? manual.notes : row.notes || '';
  row.camerasEditedBy = manual.lastCameraEditedBy || null;
  row.camerasEditedAt = manual.lastCameraEditedAt || null;
  const camSum = cameraManual.toSummary(
    manual.cameraStatus || { camerasOk: manual.camerasOk, badChannels: manual.badChannels },
  );
  row.cameraStatus = camSum.status;
  row.camerasLabel = camSum.label;
  row.camerasOk = camSum.ok;
  return row;
}

function buildQuickRowForVehicle(vehicle, reportDate, liveByDev) {
  const devIdno = vehicle.devIdno || vehicle.id;
  const plate = vehicle.plate || vehicle.nm || devIdno;
  const live = liveByDev?.get(String(devIdno)) || null;
  const online = live ? (live.ol ?? live.online ?? 0) !== 0 : false;
  const row = {
    devIdno,
    plate,
    reportDate,
    live: live
      ? {
          online,
          speed: live.speed,
          fuel: live.fuel,
          gpsTime: live.gpsTime,
          accOn: live.accOn,
          lat: live.lat,
          lng: live.lng,
          ps: live.ps != null ? String(live.ps) : null,
        }
      : null,
    sim: vehicle.dl?.[0]?.sim != null ? String(vehicle.dl[0].sim) : vehicle.sim || '',
    helionStatus: online ? 'connected' : 'offline',
    helionLabel: online ? 'Connected' : 'Offline',
    hasIssues: false,
    issues: [],
    connectivity: { lastGpsAt: live?.gpsTime || null, offlineSpells: [] },
    offlineDurationSecs: 0,
  };
  enrichRowFromMeta(row, devIdno, reportDate);
  enrichMonitorFields(row);
  row.hasIssues =
    row.bundleLow ||
    row.fuelDisplay?.status === 'error' ||
    row.gprsDisplay?.status === 'error' ||
    row.antennaDisplay?.status === 'error';
  return row;
}

function normPlateKey(s) {
  return String(s || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function bulkUpdateSimPhones(updates = [], opts = {}) {
  const onlyIfEmpty = opts.onlyIfEmpty === true;
  let count = 0;
  const skipped = [];
  for (const u of updates) {
    const devIdno = u.devIdno ? String(u.devIdno).trim() : '';
    const plate = u.plate ? String(u.plate).trim() : '';
    const phone = String(u.simPhone || u.phone || '').trim();
    if (!phone) continue;
    let id = devIdno;
    if (!id && plate) {
      const key = normPlateKey(plate);
      const hit = Object.values(store.vehicleMeta).find(
        (m) => normPlateKey(m.plate) === key,
      );
      if (hit) id = hit.devIdno;
    }
    if (!id) {
      skipped.push({ plate, devIdno, reason: 'no_match' });
      continue;
    }
    const meta = ensureVehicleMeta(id, plate || undefined);
    if (onlyIfEmpty && meta.simPhone) continue;
    meta.simPhone = phone;
    if (plate) meta.plate = plate.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    count += 1;
  }
  if (count) save();
  return { updated: count, skipped: skipped.length ? skipped : undefined };
}

function bulkUpdateDriverInfo(updates = [], opts = {}) {
  const onlyIfEmpty = opts.onlyIfEmpty === true;
  let count = 0;
  for (const u of updates) {
    const devIdno = u.devIdno ? String(u.devIdno).trim() : '';
    const plate = u.plate ? String(u.plate).trim() : '';
    let id = devIdno;
    if (!id && plate) {
      const key = normPlateKey(plate);
      const hit = Object.values(store.vehicleMeta).find(
        (m) => normPlateKey(m.plate) === key,
      );
      if (hit) id = hit.devIdno;
    }
    if (!id) continue;
    const meta = ensureVehicleMeta(id, plate || undefined);
    const phone = u.driverPhone != null ? String(u.driverPhone).trim() : null;
    const comment = u.driverComment != null ? String(u.driverComment).trim() : null;
    if (phone !== null) {
      if (onlyIfEmpty && meta.driverPhone) continue;
      meta.driverPhone = phone || null;
    }
    if (comment !== null) {
      if (onlyIfEmpty && meta.driverComment) continue;
      meta.driverComment = comment || null;
    }
    if (phone !== null || comment !== null) count += 1;
  }
  if (count) save();
  return { updated: count };
}

function bulkAssignDriverToVehicles({ devIdnos = [], driverPhone, driverComment }) {
  const ids = [...new Set(devIdnos.map((id) => String(id).trim()).filter(Boolean))];
  const updates = ids.map((devIdno) => ({
    devIdno,
    driverPhone: driverPhone !== undefined ? driverPhone : undefined,
    driverComment: driverComment !== undefined ? driverComment : undefined,
  }));
  return bulkUpdateDriverInfo(updates);
}

function bulkAssignBundles({ devIdnos = [], bundlePurchasedDate, bundleDurationDays }) {
  const date = bundlePurchasedDate
    ? String(bundlePurchasedDate).slice(0, 10)
    : todayStr();
  const days = parseInt(bundleDurationDays, 10);
  if (!Number.isFinite(days) || days <= 0) {
    return { updated: 0, error: 'bundleDurationDays must be a positive number' };
  }
  const ids = [...new Set(devIdnos.map((id) => String(id).trim()).filter(Boolean))];
  let count = 0;
  for (const id of ids) {
    const meta = ensureVehicleMeta(id);
    meta.bundlePurchasedDate = date;
    meta.bundleDurationDays = days;
    count += 1;
  }
  if (count) save();
  return { updated: count, bundlePurchasedDate: date, bundleDurationDays: days };
}

function attachVehicleTimestamps(row, devIdno, cmsReportDate) {
  const meta = ensureVehicleMeta(devIdno, row.plate);
  const syncedAt = new Date().toISOString();
  meta.lastCmsSyncAt = syncedAt;
  if (row.live?.gpsTime) meta.lastGpsUploadAt = row.live.gpsTime;
  else if (row.connectivity?.lastGpsAt) meta.lastGpsUploadAt = row.connectivity.lastGpsAt;

  row.cmsReportDate = cmsReportDate;
  attachBundleFields(row, meta);
  row.cmsDataSyncedAt = syncedAt;
  row.lastManualEditAt = meta.lastManualEditAt;
  row.lastGpsUploadAt = meta.lastGpsUploadAt || row.live?.gpsTime || null;
  row.updatedAt = syncedAt;
  return row;
}

function getVehicleUpdateHistory(devIdno, opts = {}) {
  const id = String(devIdno);
  const limit = Math.min(parseInt(opts.limit) || 100, 300);
  const meta = getVehicleMeta(id) || ensureVehicleMeta(id);

  const syncLog = store.syncLog
    .filter((e) => String(e.devIdno) === id)
    .slice(0, limit);

  const journalEntries = store.entries
    .filter((e) => String(e.devIdno) === id)
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
    .slice(0, limit);

  const inspectionSnapshots = Object.values(store.inspections)
    .filter((i) => String(i.devIdno) === id)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 50);

  return {
    vehicleMeta: meta,
    syncLog,
    journalEntries,
    inspectionSnapshots,
  };
}

async function buildInspectionForVehicle(vehicle, reportDate, dropThresholdL, periodOpts = {}) {
  const devIdno = vehicle.devIdno || vehicle.id;
  const plate = vehicle.plate || vehicle.nm || devIdno;
  const period = resolveReportPeriod(reportDate, periodOpts);
  const range = parseDateRange(period.from, period.to);
  const dropThreshold = dropThresholdL ?? store.settings.defaultDropThresholdL ?? 20;
  const manual = getManualInspection(devIdno, period.to);

  const [statusRes, tracksRes, alarmRes] = await Promise.allSettled([
    cms.getVehicleGPS(devIdno),
    cms.getGPSHistory(devIdno, range.begintime, range.endtime),
    cms.getAlarms({ devIdno, begintime: range.begintime, endtime: range.endtime, pageSize: 50 }),
  ]);

  const liveStatus = statusRes.status === 'fulfilled' ? statusRes.value : null;

  const trackList = tracksRes.status === 'fulfilled' ? (tracksRes.value || []) : [];
  const scaledTracks = trackList.map((t) => ({
    gpsTime: t.gpsTime || t.gt,
    gt: t.gt || t.gpsTime,
    fuel: t.fuel,
    yl: t.yl,
  }));
  const fuelSeries = normalizeFuelPoints({ infos: trackList });
  const fuelEvents = detectFuelEvents(fuelSeries, dropThreshold, dropThreshold);
  const isToday = period.singleDay && period.to === todayStr();
  const connectivity = analyzeGpsTrack(trackList.length ? trackList : scaledTracks, {
    asOfMs: isToday ? Date.now() : new Date(`${period.to}T23:59:59`).getTime(),
    historicalDay: !isToday,
  });

  let uptimeWrap = { offlineNowSecs: 0, last: null };
  try {
    const tl = uptimeAnalytics.timeline(devIdno, { date: period.to });
    uptimeWrap = {
      offlineNowSecs: tl.summary?.offlineNowSecs || 0,
      last: tl.summary?.last || null,
    };
  } catch (_) {}

  const alarms = alarmRes.status === 'fulfilled' ? (alarmRes.value?.alarms || []) : [];

  const row = buildInspectionRow({
    vehicle,
    liveStatus: liveStatus || { ol: 0, online: 0 },
    fuelSeries,
    fuelEvents,
    connectivity,
    uptimeSummary: uptimeWrap,
    dropThresholdL: dropThreshold,
    reportDate: period.to,
    manual: {
      camerasOk: manual.camerasOk,
      cameraStatus: manual.cameraStatus,
      badChannels: manual.badChannels,
      notes: manual.notes || '',
      alarmCount: alarms.length,
    },
  });

  const camSum = cameraManual.toSummary(
    manual.cameraStatus || { camerasOk: manual.camerasOk, badChannels: manual.badChannels },
  );
  row.cameraStatus = camSum.status;
  row.camerasLabel = camSum.label;
  row.camerasOk = camSum.ok;

  row.periodFrom = period.from;
  row.periodTo = period.to;
  row.periodLabel = period.label;

  row.manualEntries = listEntries({
    from: period.from,
    to: period.to,
    devIdnos: [devIdno],
  });

  attachVehicleTimestamps(row, devIdno, period.to);

  pushSyncLog({
    devIdno,
    plate,
    type: 'cms_sync',
    cmsReportDate: period.label,
    summary: (row.autoNotes || '').slice(0, 200),
    createdBy: null,
    lastGpsUploadAt: row.lastGpsUploadAt,
    helionStatus: row.helionStatus,
  }, false);

  await enrichMonitorFieldsAsync(row);
  return row;
}

async function refreshReportLiveByDate(reportDate, dropThresholdL, vehicles, periodOpts = {}) {
  const period = resolveReportPeriod(reportDate, periodOpts);
  if (!period.singleDay) return null;
  const date = period.to;
  const cacheKey = reportCacheKey(period.from, period.to, dropThresholdL, vehicles.length);
  const hit = reportBuildCache.get(cacheKey);
  if (!hit?.report?.rows?.length) return null;
  return refreshReportLive(hit.report.rows, date);
}

/** Fast live refresh for monitoring (~30s poll) — updates fuel/GPRS/antenna without full track rebuild. */
async function refreshReportLive(rows, reportDate) {
  const asOf = Date.now();
  const statuses = await cms.getAllGPS().catch(() => []);
  const map = new Map();
  for (const s of statuses) {
    const id = String(s.devIdno || s.id || '');
    if (id) map.set(id, s);
  }

  for (const row of rows || []) {
    const live = map.get(String(row.devIdno));
    if (live) {
      const online = (live.ol ?? live.online ?? 0) !== 0;
      row.live = {
        online,
        speed: live.speed,
        fuel: live.fuel,
        gpsTime: live.gpsTime,
        accOn: live.accOn,
        lat: live.lat,
        lng: live.lng,
        ps: live.ps != null ? String(live.ps) : null,
      };
      if (!online) {
        row.helionStatus = row.offlineDurationSecs >= 48 * 3600 ? 'not_active' : 'offline';
        row.helionLabel = row.helionStatus === 'not_active' ? 'N/A Not Active' : 'Offline';
      } else {
        row.helionStatus = 'connected';
        row.helionLabel = 'Connected';
      }
    }
    await enrichMonitorFieldsAsync(row, asOf);
  }

  return {
    reportDate: String(reportDate).slice(0, 10),
    refreshedAt: new Date(asOf).toISOString(),
    rows,
  };
}

function analyzeFleetFuelDrops(rows, minLitres = 20, maxMinutesBetween = 180) {
  const minL = Math.max(0, Number(minLitres) || 20);
  const maxGap = Math.max(1, Number(maxMinutesBetween) || 180);
  const hits = [];
  for (const row of rows || []) {
    const drops = [...(row.fuel?.drops || [])].sort((a, b) => (a.time || 0) - (b.time || 0));
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (d.litres < minL) continue;
      let gapMin = null;
      if (i > 0 && drops[i - 1].time && d.time) {
        gapMin = Math.round((d.time - drops[i - 1].time) / 60000);
      }
      if (i === 0 || gapMin == null || gapMin <= maxGap) {
        hits.push({
          devIdno: row.devIdno,
          plate: row.plate,
          litres: d.litres,
          at: d.timeStr || (d.time ? new Date(d.time).toISOString() : null),
          minutesSincePrevDrop: gapMin,
          reportDate: row.reportDate,
        });
      }
    }
  }
  hits.sort((a, b) => b.litres - a.litres);
  return hits;
}

function analyzeFleetGprsGaps(rows, minGapMinutes = 30) {
  const minSec = Math.max(60, (Number(minGapMinutes) || 30) * 60);
  const hits = [];
  for (const row of rows || []) {
    for (const spell of row.connectivity?.offlineSpells || []) {
      if ((spell.durationSecs || 0) >= minSec) {
        hits.push({
          devIdno: row.devIdno,
          plate: row.plate,
          durationSecs: spell.durationSecs,
          durationLabel: spell.label || `${Math.round(spell.durationSecs / 60)}m`,
          from: spell.from,
          to: spell.to,
          reportDate: row.reportDate,
        });
      }
    }
    const gprsAge = row.gprsDisplay?.ageLabel;
    if (row.gprsDisplay?.status === 'error' && row.gprsDisplay?.updatedAt) {
      hits.push({
        devIdno: row.devIdno,
        plate: row.plate,
        durationSecs: null,
        durationLabel: `Stale GPS (${gprsAge})`,
        from: row.gprsDisplay.updatedAt,
        to: null,
        reportDate: row.reportDate,
      });
    }
  }
  hits.sort((a, b) => (b.durationSecs || 0) - (a.durationSecs || 0));
  return hits;
}

function getManualHistory(devIdno, opts = {}) {
  const limit = Math.min(parseInt(opts.limit) || 200, 500);
  const entries = store.entries
    .filter((e) => String(e.devIdno) === String(devIdno))
    .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
    .slice(0, limit);
  return entries;
}

/** Run async work over items with limited parallelism (CMS calls are slow). */
async function mapWithConcurrency(items, fn, concurrency = 8) {
  const n = items.length;
  if (!n) return [];
  const out = new Array(n);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, n) }, async () => {
    while (next < n) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const reportBuildCache = new Map();
const inflightReports = new Map();
const REPORT_CACHE_MS = parseInt(process.env.DAILY_REPORT_CACHE_MS, 10) || 180000;

function reportCacheKey(from, to, dropThresholdL, vehicleCount) {
  return `${from}|${to}|${dropThresholdL}|${vehicleCount}`;
}

async function buildDailyFleetReport(vehicles, reportDate, dropThresholdL, opts = {}) {
  const period = resolveReportPeriod(reportDate, opts);
  const cacheKey = reportCacheKey(period.from, period.to, dropThresholdL, vehicles.length);
  if (!opts.forceRefresh) {
    const hit = reportBuildCache.get(cacheKey);
    if (hit && Date.now() - hit.at < REPORT_CACHE_MS) {
      const report = { ...hit.report, cached: true };
      report.rows = sortDailyReportRows(report.rows || []);
      return report;
    }
    const pending = inflightReports.get(cacheKey);
    if (pending) return pending;
  }

  const work = buildDailyFleetReportWork(vehicles, period, dropThresholdL, cacheKey);
  if (!opts.forceRefresh) inflightReports.set(cacheKey, work);
  try {
    return await work;
  } finally {
    inflightReports.delete(cacheKey);
  }
}

async function buildDailyFleetReportWork(vehicles, period, dropThresholdL, cacheKey) {
  const concurrency = Math.max(1, Math.min(16, parseInt(process.env.DAILY_REPORT_CONCURRENCY, 10) || 8));
  const built = await mapWithConcurrency(
    vehicles,
    async (v, i) => {
      try {
        const row = await buildInspectionForVehicle(v, period.from, dropThresholdL, {
          from: period.from,
          to: period.to,
        });
        row.no = i + 1;
        return row;
      } catch (e) {
        return {
          no: i + 1,
          devIdno: v.devIdno || v.id,
          plate: v.plate || v.nm,
          reportDate: period.to,
          periodFrom: period.from,
          periodTo: period.to,
          error: e.message,
          hasIssues: true,
          issues: [{ code: 'error', message: e.message, severity: 'high' }],
        };
      }
    },
    concurrency,
  );

  const rows = sortDailyReportRows(built);
  const issues = [];
  for (const row of rows) {
    if (row.hasIssues) {
      for (const iss of row.issues) {
        issues.push({
          ...iss,
          devIdno: row.devIdno,
          plate: row.plate,
          reportDate: period.to,
          periodFrom: period.from,
          periodTo: period.to,
        });
      }
    }
  }

  issues.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
  });

  save();

  const result = {
    reportDate: period.to,
    period: { from: period.from, to: period.to, label: period.label },
    reportRefreshedAt: new Date().toISOString(),
    title: 'HELION TRACKING — DAILY FLEET MONITORING REPORT',
    rows,
    summary: {
      total: rows.length,
      withIssues: rows.filter((r) => r.hasIssues).length,
      offline: rows.filter((r) => r.helionStatus !== 'connected').length,
      fuelIssues: rows.filter((r) => r.fuelSensorOk === false).length,
      gprsIssues: rows.filter((r) => r.gprsOk === false).length,
      cameraIssues: rows.filter((r) => r.camerasOk === false).length,
    },
    issues,
    settings: getSettings(),
    cached: false,
  };
  reportBuildCache.set(cacheKey, { at: Date.now(), report: result });
  return result;
}

function rowsToCsv(report) {
  const header = [
    'NO',
    'PLATE / CHASSIS NO',
    'DEVICE ID',
    'SIM NUMBER',
    'DATA BUNDLE PURCHASED',
    'LAST CMS SYNC',
    'LAST GPS UPLOAD',
    'CMS ANALYTICS DAY',
    'CAMERAS',
    'FUEL SENSOR',
    'GPRS',
    'ANTENNA',
    'HELION STATUS',
    'NOTES / DETAILS',
  ];
  const lines = [header.join(',')];
  for (const r of report.rows) {
    const ok = (v) => (v === true ? 'OK' : v === false ? 'ISSUE' : '');
    lines.push(
      [
        r.no,
        `"${String(r.plate || '').replace(/"/g, '""')}"`,
        r.devIdno,
        r.sim || '',
        r.bundlePurchasedDate || '',
        r.cmsDataSyncedAt || '',
        r.lastGpsUploadAt || '',
        r.cmsReportDate || r.reportDate || '',
        ok(r.camerasOk),
        ok(r.fuelSensorOk),
        ok(r.gprsOk),
        r.offlineLabel || ok(r.antennaOk),
        r.helionLabel || '',
        `"${String((r.notes || r.autoNotes || '')).replace(/"/g, '""')}"`,
      ].join(','),
    );
  }
  return lines.join('\n');
}

async function buildVehicleInsight(devIdno, plate, begintime, endtime, dropThresholdL) {
  const dropThreshold = dropThresholdL ?? store.settings.defaultDropThresholdL ?? 20;

  const [tracks, alarmResp, liveFuel] = await Promise.allSettled([
    cms.getGPSHistory(devIdno, begintime, endtime),
    cms.getAlarms({ devIdno, begintime, endtime, pageSize: 100 }),
    cms.getFuelLevel(devIdno),
  ]);

  const trackList = tracks.status === 'fulfilled' ? tracks.value || [] : [];
  const fuelSeries = normalizeFuelPoints({ infos: trackList });
  const fuelEvents = detectFuelEvents(fuelSeries, dropThreshold, dropThreshold);
  const alarms = alarmResp.status === 'fulfilled' ? (alarmResp.value?.alarms || []) : [];

  let live = null;
  if (liveFuel.status === 'fulfilled' && liveFuel.value) {
    const f = liveFuel.value;
    live = {
      fuel: f.fuelValue,
      speed: f.speed,
      online: f.online,
      gpsTime: f.gpsTime,
      lat: f.lat,
      lng: f.lng,
    };
  }

  const autoNote = buildAutoNotes({
    plate,
    devIdno,
    live,
    fuelSeries,
    fuelEvents,
    alarms,
    dropThresholdL: dropThreshold,
  });

  return {
    devIdno,
    plate,
    period: { begintime, endtime },
    dropThresholdL: dropThreshold,
    live,
    fuel: {
      points: fuelSeries.length,
      startL: fuelSeries[0]?.fuel ?? null,
      endL: fuelSeries[fuelSeries.length - 1]?.fuel ?? null,
      consumedL: totalConsumption(fuelSeries),
      events: fuelEvents,
      sharpDrops: fuelEvents.filter((e) => e.type === 'drop'),
      refuels: fuelEvents.filter((e) => e.type === 'refuel'),
    },
    alarms: alarms.slice(0, 20),
    alarmCount: alarms.length,
    autoNote,
  };
}

async function buildInsightsForVehicles(vehicles, begintime, endtime, dropThresholdL) {
  const results = [];
  for (const v of vehicles) {
    const devIdno = v.devIdno || v.id;
    const plate = v.plate || v.nm || devIdno;
    try {
      const insight = await buildVehicleInsight(devIdno, plate, begintime, endtime, dropThresholdL);
      const manualEntries = listEntries({
        from: begintime.slice(0, 10),
        to: endtime.slice(0, 10),
        devIdnos: [devIdno],
      });
      results.push({ ...insight, manualEntries });
    } catch (e) {
      results.push({
        devIdno,
        plate,
        error: e.message,
        autoNote: `Failed to load CMS data: ${e.message}`,
        manualEntries: listEntries({
          from: begintime.slice(0, 10),
          to: endtime.slice(0, 10),
          devIdnos: [devIdno],
        }),
      });
    }
  }
  return results;
}

function setFuelCalibration(devIdno, calibrated, { plate, createdBy } = {}) {
  const id = String(devIdno);
  const meta = ensureVehicleMeta(id, plate);
  const val = !!calibrated;
  meta.fuelCalibrated = val;
  meta.fuelSensorCalibrated = val;
  meta.lastManualEditAt = new Date().toISOString();
  save();
  pushSyncLog({
    devIdno: id,
    plate: meta.plate,
    type: 'manual_edit',
    message: val ? 'fuel sensor marked calibrated' : 'fuel sensor marked NOT calibrated (excluded from fuel alerts)',
    by: createdBy || 'user',
  });
  return meta;
}

module.exports = {
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  getSettings,
  setSettings,
  buildVehicleInsight,
  buildInsightsForVehicles,
  parseDateRange,
  resolveReportPeriod,
  todayStr,
  inspectionKey,
  getManualInspection,
  saveManualInspection,
  buildInspectionForVehicle,
  buildDailyFleetReport,
  rowsToCsv,
  ensureVehicleMeta,
  getVehicleMeta,
  setFuelCalibration,
  getVehicleUpdateHistory,
  getManualHistory,
  refreshReportLive,
  refreshReportLiveByDate,
  analyzeFleetFuelDrops,
  analyzeFleetGprsGaps,
  pushSyncLog,
  enrichRowFromMeta,
  buildQuickRowForVehicle,
  bulkUpdateSimPhones,
  bulkUpdateDriverInfo,
  bulkAssignDriverToVehicles,
  bulkAssignBundles,
  normPlateKey,
  sortDailyReportRows,
  refreshVehicleMetaFromDisk,
};
