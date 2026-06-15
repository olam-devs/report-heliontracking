const cms = require('./lib/services/cmsv6.service');
const dailyLog = require('./lib/services/daily-log.service');
const {
  analyzeVehicleTracks,
  loadNotifications,
  saveNotifications,
  appendNotifications,
  NOTIFICATION_MIN_LITRES,
} = require('./fuel-insights.engine');

const { isRangeCovered, markRangeCovered } = require('./notification-coverage');

const SCAN_INTERVAL_MS = parseInt(process.env.NOTIFICATION_SCAN_MS || '', 10) || 3 * 60 * 1000;
const LOOKBACK_HOURS = parseInt(process.env.NOTIFICATION_LOOKBACK_HOURS || '', 10) || 48;

let timer = null;
let running = false;

function pad(n) {
  return String(n).padStart(2, '0');
}

function toCmsDt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

async function runNotificationScan({ begintime, endtime, plate } = {}) {
  if (running) return { skipped: true, reason: 'scan_in_progress' };
  running = true;
  try {
    const end = endtime ? new Date(String(endtime).replace(' ', 'T')) : new Date();
    const start = begintime
      ? new Date(String(begintime).replace(' ', 'T'))
      : new Date(end.getTime() - LOOKBACK_HOURS * 3600000);

    const bt = typeof begintime === 'string' && begintime.includes(':')
      ? begintime.replace('T', ' ').length === 16 ? `${begintime.replace('T', ' ')}:00` : begintime.replace('T', ' ')
      : toCmsDt(start);
    const et = typeof endtime === 'string' && endtime.includes(':')
      ? endtime.replace('T', ' ').length === 16 ? `${endtime.replace('T', ' ')}:00` : endtime.replace('T', ' ')
      : toCmsDt(end);

    dailyLog.refreshVehicleMetaFromDisk();
    const vehicles = await cms.getVehicles();
    let list = (vehicles || []).map((v) => ({
      devIdno: v.devIdno || v.id,
      plate: v.plate || v.nm || v.devIdno,
    })).filter((v) => v.devIdno);

    const filterPlate = String(plate || '').trim().toLowerCase().replace(/\s+/g, '');
    if (filterPlate) {
      list = list.filter((v) =>
        String(v.plate || '').replace(/\s+/g, '').toLowerCase().includes(filterPlate),
      );
    }

    const concurrency = Math.max(1, Math.min(8, parseInt(process.env.ANALYTICS_CONCURRENCY || '', 10) || 6));

    const results = await mapWithConcurrency(list, async (v) => {
      let tracks = [];
      try {
        tracks = await cms.getGPSHistory(v.devIdno, bt, et);
      } catch (_) {
        return { alerts: [] };
      }
      const meta = dailyLog.getVehicleMeta(v.devIdno);
      const r = await analyzeVehicleTracks({
        devIdno: v.devIdno,
        plate: v.plate,
        tracks,
        dropThresholdL: NOTIFICATION_MIN_LITRES,
        mode: 'notifications',
        vehicleMeta: meta,
      });
      return r;
    }, concurrency);

    const incoming = results.flatMap((r) => r.alerts || []);
    const store = appendNotifications(loadNotifications(), incoming);
    saveNotifications(store);
    const fromTsCov = bt.replace(' ', 'T').slice(0, 16);
    const toTsCov = et.replace(' ', 'T').slice(0, 16);
    markRangeCovered(fromTsCov, toTsCov, filterPlate || '');
    console.log(`[notifications] scan ${bt} → ${et}: +${store.added} new (${store.items.length} total)`);
    return { added: store.added, total: store.items.length, begintime: bt, endtime: et };
  } finally {
    running = false;
  }
}

function startNotificationScanner() {
  if (timer) return;
  const tick = () => {
    runNotificationScan().catch((e) => {
      console.error('[notifications] scan failed:', e.message);
    });
  };
  tick();
  timer = setInterval(tick, SCAN_INTERVAL_MS);
  console.log(`[notifications] background scanner every ${Math.round(SCAN_INTERVAL_MS / 60000)} min (≥${NOTIFICATION_MIN_LITRES}L theft only)`);
}

function stopNotificationScanner() {
  if (timer) clearInterval(timer);
  timer = null;
}

function toQueryTs(fromTs, toTs, from, to) {
  const f = fromTs || (from ? `${String(from).slice(0, 10)}T00:00` : null);
  const t = toTs || (to ? `${String(to).slice(0, 10)}T23:59` : null);
  return { fromTs: f, toTs: t };
}

function toCmsRange(fromTs, toTs) {
  const fmt = (ts) => {
    const s = String(ts).trim();
    if (s.includes('T')) {
      const [d, time] = s.split('T');
      const t = time.length === 5 ? `${time}:00` : time;
      return `${d} ${t}`;
    }
    return s;
  };
  return { begintime: fmt(fromTs), endtime: fmt(toTs) };
}

async function ensureNotificationsForRange({ fromTs, toTs, from, to, plate } = {}) {
  const range = toQueryTs(fromTs, toTs, from, to);
  if (!range.fromTs || !range.toTs) {
    return { skipped: true, reason: 'no_range' };
  }
  if (isRangeCovered(range.fromTs, range.toTs, plate)) {
    return { skipped: true, reason: 'already_covered', ...range };
  }
  const { begintime, endtime } = toCmsRange(range.fromTs, range.toTs);
  const result = await runNotificationScan({ begintime, endtime, plate });
  return { ...result, backfilled: !result.skipped, ...range, begintime, endtime };
}

module.exports = {
  runNotificationScan,
  startNotificationScanner,
  stopNotificationScanner,
  ensureNotificationsForRange,
};
