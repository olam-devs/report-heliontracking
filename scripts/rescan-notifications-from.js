/**
 * Clear notifications from a start date, reset read state, and rescan with current rules.
 * Usage: node scripts/rescan-notifications-from.js [YYYY-MM-DD]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
  loadNotifications,
  saveNotifications,
  purgeMalformedNotifications,
} = require('../src/tracking/fuel-insights.engine');
const { loadCoverage, saveCoverage } = require('../src/tracking/notification-coverage');
const { saveReads } = require('../src/tracking/notification-reads');
const { ensureNotificationsForRange } = require('../src/tracking/notification-scanner.service');
const { parseMs } = require('../src/tracking/notification-coverage');

const FROM_DATE = process.argv[2] || '2026-06-01';

function nowToTs() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function main() {
  const fromTs = `${FROM_DATE}T00:00`;
  const toTs = nowToTs();
  const fromMs = parseMs(fromTs);
  if (fromMs == null) {
    console.error('Invalid from date:', FROM_DATE);
    process.exit(1);
  }

  const store = loadNotifications();
  const before = (store.items || []).length;
  store.items = (store.items || []).filter((a) => {
    const t = parseMs(a.at);
    return t == null || t < fromMs;
  });
  const removed = before - store.items.length;
  saveNotifications(store);
  console.log(`Removed ${removed} notification(s) from ${FROM_DATE} onward (kept ${store.items.length} older).`);

  const cov = loadCoverage();
  const covBefore = (cov.windows || []).length;
  cov.windows = (cov.windows || []).filter((w) => w.toMs < fromMs);
  saveCoverage(cov);
  console.log(`Cleared ${covBefore - cov.windows.length} coverage window(s) overlapping ${FROM_DATE}+.`);

  saveReads({ users: {} });
  console.log('Reset notification read state — all will show as unread.');

  console.log(`Rescanning fleet ${fromTs} → ${toTs} (may take several minutes)...`);
  const result = await ensureNotificationsForRange({ fromTs, toTs });
  console.log('Backfill result:', JSON.stringify(result, null, 2));

  const malformed = purgeMalformedNotifications();
  if (malformed > 0) console.log(`Purged ${malformed} malformed alert(s) after rescan.`);

  const after = loadNotifications();
  const fromJune = (after.items || []).filter((a) => {
    const t = parseMs(a.at);
    return t != null && t >= fromMs;
  }).length;
  console.log(`Done. ${fromJune} notification(s) from ${FROM_DATE}+ (total stored: ${after.items.length}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
