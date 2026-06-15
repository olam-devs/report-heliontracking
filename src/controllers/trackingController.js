const cms = require('../tracking/lib/services/cmsv6.service');
const dailyLog = require('../tracking/lib/services/daily-log.service');
const {
  analyzeVehicleTracks,
  loadNotifications,
  searchAlerts,
  countUnread,
  purgeNotificationsForVehicle,
  NOTIFICATION_MIN_LITRES,
} = require('../tracking/fuel-insights.engine');
const { getLastSeen, markSeen } = require('../tracking/notification-reads');
const { runNotificationScan, ensureNotificationsForRange } = require('../tracking/notification-scanner.service');
const {
  listDangerZones,
  getDangerZone,
  updateDangerZone,
  notificationsNearDangerPoint,
  rebuildDangerZonesFromNotifications,
  RADIUS_M,
} = require('../tracking/danger-zones.service');
const { resolveTrackingPageAccess } = require('../tracking/tracking-permissions');

const ok = (res, data, meta = {}) => res.json({ success: true, ...meta, data });
const err = (res, msg, status = 400) => res.status(status).json({ success: false, error: msg });

async function loadVehicles(res) {
  try {
    const list = await cms.getVehicles();
    return (list || []).map((v) => ({
      devIdno: v.devIdno || v.id,
      plate: v.plate || v.nm || v.devIdno,
      nm: v.nm,
      dl: v.dl,
    }));
  } catch (e) {
    err(res, e.message, 503);
    return null;
  }
}

function queryPeriod(req) {
  const date = (req.query.date || req.query.from || dailyLog.todayStr()).slice(0, 10);
  return dailyLog.resolveReportPeriod(date, {
    from: req.query.from,
    to: req.query.to || req.query.date,
  });
}

function dtToCms(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  if (s.includes('T')) {
    const [date, time] = s.split('T');
    const t = time && time.length === 5 ? `${time}:00` : (time || '00:00:00');
    return `${date} ${t}`;
  }
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.length === 16 ? `${s}:00` : s;
  }
  return null;
}

function queryDateTimeRange(req) {
  const p = queryPeriod(req);
  const bt = dtToCms(req.query.begintime || req.query.begin || req.query.fromTs);
  const et = dtToCms(req.query.endtime || req.query.end || req.query.toTs);
  if (bt && et) return { period: p, begintime: bt, endtime: et };
  return { period: p, begintime: `${p.from} 00:00:00`, endtime: `${p.to} 23:59:59` };
}

async function mapWithConcurrency(items, fn, concurrency = 6) {
  const n = items.length;
  if (!n) return [];
  const out = new Array(n);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, n) }, async () => {
    while (next < n) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

exports.health = (req, res) => {
  ok(res, {
    status: 'ok',
    module: 'tracking',
    cms: process.env.CMSV6_BASE_URL,
  });
};

exports.reportQuick = async (req, res) => {
  try {
    dailyLog.refreshVehicleMetaFromDisk();
    const date = (req.query.date || dailyLog.todayStr()).slice(0, 10);
    const vehicles = await loadVehicles(res);
    if (!vehicles) return;
    const statuses = await cms.getAllGPS().catch(() => []);
    const map = new Map();
    for (const s of statuses) {
      const id = String(s.devIdno || s.id || '');
      if (id) map.set(id, s);
    }
    const rows = dailyLog.sortDailyReportRows(
      vehicles.map((v) => dailyLog.buildQuickRowForVehicle(v, date, map)),
    );
    ok(res, {
      reportDate: date,
      reportRefreshedAt: new Date().toISOString(),
      rows,
      summary: {
        total: rows.length,
        withIssues: rows.filter((r) => r.hasIssues).length,
        offline: rows.filter((r) => r.helionStatus !== 'connected').length,
      },
      quick: true,
    });
  } catch (e) {
    err(res, e.message, 500);
  }
};

async function buildRowForDev(devIdno, reportDate) {
  dailyLog.refreshVehicleMetaFromDisk();
  const meta = dailyLog.getVehicleMeta(devIdno) || {};
  const statuses = await cms.getAllGPS().catch(() => []);
  const map = new Map();
  for (const s of statuses) {
    const id = String(s.devIdno || s.id || '');
    if (id) map.set(id, s);
  }
  return dailyLog.buildQuickRowForVehicle(
    { devIdno, plate: meta.plate || devIdno },
    reportDate,
    map,
  );
}

exports.patchVehicle = async (req, res) => {
  try {
    dailyLog.refreshVehicleMetaFromDisk();
    const devIdno = String(req.params.id);
    const patch = req.body || {};
    const date = (req.query.date || dailyLog.todayStr()).slice(0, 10);
    if (patch.fuelCalibrated !== undefined || patch.fuelSensorCalibrated !== undefined) {
      const val = patch.fuelCalibrated !== undefined ? patch.fuelCalibrated : patch.fuelSensorCalibrated;
      dailyLog.setFuelCalibration(devIdno, !!val, {
        plate: patch.plate,
        createdBy: req.user?.name || 'user',
      });
      if (!val) {
        const removed = purgeNotificationsForVehicle(devIdno);
        if (removed > 0) {
          console.log(`[notifications] purged ${removed} alert(s) for uncalibrated ${devIdno}`);
        }
      }
    }
    const metaPatch = { ...patch };
    delete metaPatch.fuelCalibrated;
    delete metaPatch.fuelSensorCalibrated;
    if (Object.keys(metaPatch).length) {
      dailyLog.saveManualInspection(devIdno, date, metaPatch, req.user?.name || 'user');
    }
    const meta = dailyLog.getVehicleMeta(devIdno);
    const row = await buildRowForDev(devIdno, date);
    ok(res, {
      row,
      vehicleMeta: meta,
      manualHistory: dailyLog.getManualHistory(devIdno),
    });
  } catch (e) {
    err(res, e.message, 500);
  }
};

exports.runFuelAnalysis = async (req, res) => {
  try {
    const settings = dailyLog.getSettings();
    const rawThreshold = req.query.dropThresholdL;
    const dropThresholdL = rawThreshold != null && rawThreshold !== ''
      ? Math.max(1, parseFloat(rawThreshold))
      : (settings.defaultDropThresholdL || 20);
    const { period, begintime, endtime } = queryDateTimeRange(req);
    const vehicles = await loadVehicles(res);
    if (!vehicles) return;

    const filterDev = String(req.query.devIdno || '').trim();
    const filterPlate = String(req.query.plate || '').trim().toLowerCase();
    let list = vehicles;
    if (filterDev) list = list.filter((v) => String(v.devIdno) === filterDev);
    if (filterPlate) {
      list = list.filter((v) => String(v.plate || '').replace(/\s+/g, '').toLowerCase().includes(filterPlate.replace(/\s+/g, '')));
    }

    dailyLog.refreshVehicleMetaFromDisk();
    const concurrency = Math.max(1, Math.min(8, parseInt(process.env.ANALYTICS_CONCURRENCY || '', 10) || 6));

    const results = await mapWithConcurrency(list, async (v) => {
      const devIdno = v.devIdno;
      if (!devIdno) return { devIdno, plate: v.plate, alerts: [], skipped: true };
      let tracks = [];
      try {
        tracks = await cms.getGPSHistory(devIdno, begintime, endtime);
      } catch (_) {
        return { devIdno, plate: v.plate, alerts: [], error: 'cms_history_failed' };
      }
      const meta = dailyLog.getVehicleMeta(devIdno);
      return analyzeVehicleTracks({
        devIdno,
        plate: v.plate || v.nm || devIdno,
        tracks,
        dropThresholdL,
        mode: 'fuel_alerts',
        vehicleMeta: meta,
      });
    }, concurrency);

    const alerts = results.flatMap((r) => r.alerts || []);

    ok(res, {
      alerts,
      period,
      range: { begintime, endtime },
      dropThresholdL,
      vehiclesAnalyzed: results.filter((r) => !r.skipped).length,
      skippedUncalibrated: results.filter((r) => r.reason === 'fuel_sensor_not_calibrated').length,
    }, { count: alerts.length });
  } catch (e) {
    err(res, e.message, 500);
  }
};

exports.listNotifications = async (req, res) => {
  try {
    dailyLog.refreshVehicleMetaFromDisk();
    const { devIdno, plate, from, to, date, fromTs, toTs, kind, backfill } = req.query;
    let backfillResult = null;
    const wantBackfill = backfill !== '0' && (fromTs || toTs || from || to);
    if (wantBackfill) {
      backfillResult = await ensureNotificationsForRange({
        fromTs,
        toTs,
        from: date || from,
        to: date || to,
        plate,
      });
    }
    const store = loadNotifications();
    const getMeta = (id) => dailyLog.getVehicleMeta(id);
    const kinds = kind ? String(kind).split(',').map((s) => s.trim()).filter(Boolean) : null;
    const items = searchAlerts({
      items: store.items,
      devIdno,
      plate,
      from,
      to,
      date,
      fromTs,
      toTs,
      kinds,
      seriousOnly: true,
      getVehicleMeta: getMeta,
    });
    ok(res, {
      items,
      minLitres: NOTIFICATION_MIN_LITRES,
      backfill: backfillResult,
      filters: {
        date: date || null,
        plate: plate || null,
        devIdno: devIdno || null,
        from: from || null,
        to: to || null,
        fromTs: fromTs || null,
        toTs: toTs || null,
      },
    }, { count: items.length });
  } catch (e) {
    err(res, e.message, 500);
  }
};

exports.unreadNotificationCount = (req, res) => {
  dailyLog.refreshVehicleMetaFromDisk();
  const store = loadNotifications();
  const getMeta = (id) => dailyLog.getVehicleMeta(id);
  const unread = countUnread(store.items, req.user.id, getLastSeen, getMeta);
  ok(res, { unread, minLitres: NOTIFICATION_MIN_LITRES });
};

exports.markNotificationsSeen = (req, res) => {
  const at = markSeen(req.user.id);
  ok(res, { markedAt: at });
};

exports.getTrackingSettings = (req, res) => {
  ok(res, dailyLog.getSettings());
};

exports.patchTrackingSettings = (req, res) => {
  try {
    const patch = req.body || {};
    ok(res, dailyLog.setSettings(patch));
  } catch (e) {
    err(res, e.message, 500);
  }
};

exports.triggerNotificationScan = async (req, res) => {
  try {
    const result = await runNotificationScan({
      begintime: req.query.begintime || req.query.fromTs,
      endtime: req.query.endtime || req.query.toTs,
    });
    ok(res, result);
  } catch (e) {
    err(res, e.message, 500);
  }
};

exports.searchAlerts = exports.listNotifications;

exports.vehicleHistory = (req, res) => {
  try {
    dailyLog.refreshVehicleMetaFromDisk();
    ok(res, dailyLog.getVehicleUpdateHistory(req.params.id));
  } catch (e) {
    err(res, e.message, 500);
  }
};

exports.vehicleManualHistory = (req, res) => {
  try {
    dailyLog.refreshVehicleMetaFromDisk();
    ok(res, dailyLog.getManualHistory(req.params.id));
  } catch (e) {
    err(res, e.message, 500);
  }
};

exports.bulkBundle = (req, res) => {
  try {
    const body = req.body || {};
    const result = dailyLog.bulkAssignBundles({
      devIdnos: body.devIdnos || [],
      bundlePurchasedDate: body.bundlePurchasedDate,
      bundleDurationDays: body.bundleDurationDays,
    });
    if (result.error) return err(res, result.error, 400);
    ok(res, result);
  } catch (e) {
    err(res, e.message, 500);
  }
};

exports.bulkDriver = (req, res) => {
  try {
    const body = req.body || {};
    ok(res, dailyLog.bulkAssignDriverToVehicles({
      devIdnos: body.devIdnos || [],
      driverPhone: body.driverPhone,
      driverComment: body.driverComment,
    }));
  } catch (e) {
    err(res, e.message, 500);
  }
};

exports.vehicles = async (req, res) => {
  const vehicles = await loadVehicles(res);
  if (!vehicles) return;
  dailyLog.refreshVehicleMetaFromDisk();
  ok(res, vehicles.map((v) => {
    const meta = dailyLog.getVehicleMeta(v.devIdno) || {};
    return {
      devIdno: v.devIdno,
      plate: v.plate,
      fuelCalibrated: meta.fuelCalibrated !== false && meta.fuelSensorCalibrated !== false,
      meta,
    };
  }));
};

exports.getTrackingPageAccess = (req, res) => {
  ok(res, {
    pages: resolveTrackingPageAccess(req.user),
  });
};

exports.listDangerZones = (req, res) => {
  dailyLog.refreshVehicleMetaFromDisk();
  ok(res, { items: listDangerZones(), radiusM: RADIUS_M });
};

exports.getDangerZoneNotifications = (req, res) => {
  dailyLog.refreshVehicleMetaFromDisk();
  const dz = getDangerZone(req.params.id);
  if (!dz) return err(res, 'Danger zone point not found', 404);
  const getMeta = (id) => dailyLog.getVehicleMeta(id);
  const items = notificationsNearDangerPoint(dz, { getVehicleMeta: getMeta });
  ok(res, { dangerZone: dz, items, radiusM: dz.radiusM || RADIUS_M }, { count: items.length });
};

exports.patchDangerZone = (req, res) => {
  const dz = getDangerZone(req.params.id);
  if (!dz) return err(res, 'Danger zone point not found', 404);
  const { name } = req.body || {};
  const updated = updateDangerZone(req.params.id, {
    ...(name != null ? { name: String(name).trim() || dz.name } : {}),
  });
  ok(res, updated);
};

exports.rebuildDangerZones = (req, res) => {
  dailyLog.refreshVehicleMetaFromDisk();
  const count = rebuildDangerZonesFromNotifications((id) => dailyLog.getVehicleMeta(id));
  ok(res, { count });
};
