/** Tanzania approximate bounds (decimal degrees). */
const TZ = { latMin: -12.5, latMax: -0.5, lngMin: 28.5, lngMax: 41.5 };

function isInvalidCoord(lat, lng) {
  if (lat == null || lng == null) return true;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return true;
  if (Math.abs(la) < 0.05 && Math.abs(ln) < 0.05) return true;
  if (la < TZ.latMin || la > TZ.latMax || ln < TZ.lngMin || ln > TZ.lngMax) return true;
  return false;
}

function isValidCoord(lat, lng) {
  return !isInvalidCoord(lat, lng);
}

function findNextValidPoint(series, afterTime) {
  if (!series?.length || afterTime == null) return null;
  for (const p of series) {
    if (p.time <= afterTime) continue;
    if (isValidCoord(p.lat, p.lng)) return p;
  }
  return null;
}

function findSeriesIndex(series, pt) {
  if (!pt || !series?.length) return -1;
  const idx = series.findIndex((p) => p.time === pt.time);
  if (idx >= 0) return idx;
  return series.findIndex((p) => p.timeStr && p.timeStr === pt.timeStr);
}

module.exports = {
  TZ,
  isInvalidCoord,
  isValidCoord,
  findNextValidPoint,
  findSeriesIndex,
};
