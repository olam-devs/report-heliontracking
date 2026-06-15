/**
 * Relative time labels for monitoring (fuel / GPRS / offline).
 */

function parseTs(v) {
  if (!v) return null;
  const t = new Date(String(v).replace(' ', 'T')).getTime();
  return Number.isFinite(t) ? t : null;
}

/** e.g. "1D 2h 15m", "3h 20m", "45m", "Never" */
function formatDurationShort(secs) {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return 'Never';
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  const parts = [`${d}D`];
  if (rh > 0) parts.push(`${rh}h`);
  if (rm > 0 && d < 3) parts.push(`${rm}m`);
  return parts.join(' ');
}

function ageSecondsFromNow(tsOrIso, asOfMs = Date.now()) {
  const t = typeof tsOrIso === 'number' ? tsOrIso : parseTs(tsOrIso);
  if (t == null) return null;
  return Math.max(0, Math.round((asOfMs - t) / 1000));
}

/** @returns {'ok'|'warn'|'error'|'none'} */
function stalenessLevel(ageSecs, warnSecs = 2 * 3600, errorSecs = 6 * 3600) {
  if (ageSecs == null) return 'none';
  if (ageSecs >= errorSecs) return 'error';
  if (ageSecs >= warnSecs) return 'warn';
  return 'ok';
}

module.exports = {
  parseTs,
  formatDurationShort,
  ageSecondsFromNow,
  stalenessLevel,
};
