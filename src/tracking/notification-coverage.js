const fs = require('fs');
const path = require('path');

const COV_FILE = path.join(__dirname, '../../data/tracking/notification-coverage.json');

function loadCoverage() {
  try {
    if (fs.existsSync(COV_FILE)) {
      return JSON.parse(fs.readFileSync(COV_FILE, 'utf8'));
    }
  } catch (_) {}
  return { windows: [] };
}

function saveCoverage(store) {
  const dir = path.dirname(COV_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(COV_FILE + '.tmp', JSON.stringify(store, null, 2));
  fs.renameSync(COV_FILE + '.tmp', COV_FILE);
}

function parseMs(ts) {
  const s = String(ts || '').trim();
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function normPlate(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

function isRangeCovered(fromTs, toTs, plate = '') {
  const fromMs = parseMs(fromTs);
  const toMs = parseMs(toTs);
  if (fromMs == null || toMs == null) return false;
  const p = normPlate(plate);
  const store = loadCoverage();
  return (store.windows || []).some((w) => {
    if (normPlate(w.plate) !== p) return false;
    return w.fromMs <= fromMs && w.toMs >= toMs;
  });
}

function markRangeCovered(fromTs, toTs, plate = '') {
  const fromMs = parseMs(fromTs);
  const toMs = parseMs(toTs);
  if (fromMs == null || toMs == null) return;
  const store = loadCoverage();
  if (!store.windows) store.windows = [];
  store.windows.push({
    from: String(fromTs),
    to: String(toTs),
    fromMs,
    toMs,
    plate: normPlate(plate),
    at: new Date().toISOString(),
  });
  if (store.windows.length > 500) store.windows = store.windows.slice(-500);
  saveCoverage(store);
}

module.exports = { loadCoverage, isRangeCovered, markRangeCovered, parseMs };
