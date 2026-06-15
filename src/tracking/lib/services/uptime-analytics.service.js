/**
 * uptime-analytics.service.js — Connectivity uptime (online/offline) aggregation.
 *
 * Source of truth: monitor.service poll loop (CMSV6 getAllGPS).
 * Persistence: data/uptime-stats.json
 *
 * This tracks ONLINE vs OFFLINE time based on the CMSV6 `ol` field:
 *   ol = 0 offline, 1 online, 2 alarm (treated as online)
 *
 * Notes:
 * - This starts collecting from the time the middleware runs.
 * - For long ranges (weeks/months), this avoids expensive per-vehicle CMS queries.
 */
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const FILE = path.join(__dirname, "../../../data/uptime-stats.json");

const TIMEZONE = process.env.FLEET_TIMEZONE || "Africa/Dar_es_Salaam";
const MAX_GAP_MS = parseInt(process.env.UPTIME_MAX_GAP_MS || "", 10) || 5 * 60 * 1000; // gaps count as "unknown"

let store = {
  // date -> devIdno -> { onlineSecs, offlineSecs, unknownSecs, samples }
  daily: {},
  // devIdno -> { status: 'online'|'offline'|'unknown', ts, offlineSinceTs }
  last: {},
  // housekeeping
  updatedAt: null,
};

function dayKey(ts) {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: TIMEZONE }); // YYYY-MM-DD
}

function load() {
  try {
    if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (e) {
    logger.warn("[Uptime] Load failed: " + e.message);
  }
  store.daily = store.daily || {};
  store.last = store.last || {};
}

function save() {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = FILE + ".tmp";
    store.updatedAt = new Date().toISOString();
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    logger.warn("[Uptime] Save failed: " + e.message);
  }
}

load();

function ensureBucket(date, devIdno) {
  if (!store.daily[date]) store.daily[date] = {};
  if (!store.daily[date][devIdno]) {
    store.daily[date][devIdno] = { onlineSecs: 0, offlineSecs: 0, unknownSecs: 0, samples: 0 };
  }
  return store.daily[date][devIdno];
}

function clampInt(n, min, max) {
  const x = Math.trunc(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function ingest(statuses, nowMs = Date.now()) {
  if (!Array.isArray(statuses) || statuses.length === 0) return;

  for (const s of statuses) {
    const id = s.devIdno || s.id;
    if (!id) continue;
    const devIdno = String(id);
    const online = (s.ol ?? 0) !== 0; // 1/2 = online

    const prev = store.last[devIdno];
    if (!prev) {
      store.last[devIdno] = {
        status: online ? "online" : "offline",
        ts: nowMs,
        offlineSinceTs: online ? null : nowMs,
      };
      const b = ensureBucket(dayKey(nowMs), devIdno);
      b.samples += 1;
      continue;
    }

    const dtMs = nowMs - (prev.ts || nowMs);
    const dt = clampInt(Math.round(dtMs / 1000), 0, 60 * 60 * 12); // cap 12h per step
    const bucket = ensureBucket(dayKey(nowMs), devIdno);
    bucket.samples += 1;

    if (dtMs > 0 && dtMs <= MAX_GAP_MS) {
      if (prev.status === "online") bucket.onlineSecs += dt;
      else if (prev.status === "offline") bucket.offlineSecs += dt;
      else bucket.unknownSecs += dt;
    } else if (dtMs > MAX_GAP_MS) {
      // If we missed a long time window (server restart, CMS outage), count as unknown.
      bucket.unknownSecs += dt;
    }

    const nextStatus = online ? "online" : "offline";
    const offlineSinceTs =
      nextStatus === "offline" ? (prev.offlineSinceTs || nowMs) : null;

    store.last[devIdno] = { status: nextStatus, ts: nowMs, offlineSinceTs };
  }
}

function prune({ keepDays = 120 } = {}) {
  const today = dayKey(Date.now());
  const cutoff = new Date(`${today}T00:00:00.000Z`).getTime() - keepDays * 86400000;
  for (const d of Object.keys(store.daily)) {
    const t = new Date(`${d}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(t) || t < cutoff) delete store.daily[d];
  }
}

function parseRange({ date, days, begintime, endtime } = {}) {
  if (date) return { begintime: `${date} 00:00:00`, endtime: `${date} 23:59:59` };
  if (begintime && endtime) return { begintime, endtime };
  const n = Math.min(Math.max(parseInt(days) || 7, 1), 180);
  const now = new Date();
  const from = new Date(now - n * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { begintime: `${fmt(from)} 00:00:00`, endtime: `${fmt(now)} 23:59:59` };
}

function dateKeysInRange(begintime, endtime) {
  // Accepts "YYYY-MM-DD HH:MM:SS"
  const b = new Date(String(begintime).slice(0, 10) + "T00:00:00Z").getTime();
  const e = new Date(String(endtime).slice(0, 10) + "T00:00:00Z").getTime();
  const out = [];
  if (!Number.isFinite(b) || !Number.isFinite(e)) return out;
  for (let t = Math.min(b, e); t <= Math.max(b, e); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function summarizeForDev(devIdno, keys) {
  let onlineSecs = 0;
  let offlineSecs = 0;
  let unknownSecs = 0;
  let samples = 0;
  for (const k of keys) {
    const row = store.daily?.[k]?.[devIdno];
    if (!row) continue;
    onlineSecs += row.onlineSecs || 0;
    offlineSecs += row.offlineSecs || 0;
    unknownSecs += row.unknownSecs || 0;
    samples += row.samples || 0;
  }
  const total = onlineSecs + offlineSecs + unknownSecs;
  const onlinePct = total > 0 ? Math.round((onlineSecs / total) * 1000) / 10 : 0;
  const offlinePct = total > 0 ? Math.round((offlineSecs / total) * 1000) / 10 : 0;
  const last = store.last?.[devIdno] || null;
  const offlineNowSecs =
    last?.status === "offline" && last.offlineSinceTs ? Math.max(0, Math.round((Date.now() - last.offlineSinceTs) / 1000)) : 0;
  return { devIdno, onlineSecs, offlineSecs, unknownSecs, totalSecs: total, onlinePct, offlinePct, samples, last, offlineNowSecs };
}

function rank({ devIdnos = null, range } = {}) {
  const { begintime, endtime } = parseRange(range || {});
  const keys = dateKeysInRange(begintime, endtime);
  const ids = devIdnos ? devIdnos.map(String) : Array.from(new Set(Object.keys(store.last || {})));
  const rows = ids.map((id) => summarizeForDev(id, keys));
  rows.sort((a, b) => b.onlinePct - a.onlinePct || b.onlineSecs - a.onlineSecs);
  return { period: { begintime, endtime }, dates: keys, vehicles: rows };
}

function timeline(devIdno, range) {
  const { begintime, endtime } = parseRange(range || {});
  const keys = dateKeysInRange(begintime, endtime);
  const series = keys.map((d) => {
    const row = store.daily?.[d]?.[String(devIdno)] || null;
    return {
      date: d,
      onlineSecs: row?.onlineSecs || 0,
      offlineSecs: row?.offlineSecs || 0,
      unknownSecs: row?.unknownSecs || 0,
      samples: row?.samples || 0,
    };
  });
  return { period: { begintime, endtime }, devIdno: String(devIdno), series, summary: summarizeForDev(String(devIdno), keys) };
}

module.exports = {
  ingest,
  save,
  prune,
  rank,
  timeline,
  parseRange,
};

