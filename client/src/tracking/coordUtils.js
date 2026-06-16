/** Tanzania approximate bounds — keep in sync with server coord-utils.js */
const TZ = { latMin: -12.5, latMax: -0.5, lngMin: 28.5, lngMax: 41.5 };

export function isInvalidCoord(lat, lng) {
  if (lat == null || lng == null) return true;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return true;
  if (Math.abs(la) < 0.05 && Math.abs(ln) < 0.05) return true;
  if (la < TZ.latMin || la > TZ.latMax || ln < TZ.lngMin || ln > TZ.lngMax) return true;
  return false;
}

export function isUnknownPoint(point) {
  return !point || point.unknown || isInvalidCoord(point.lat, point.lng);
}
