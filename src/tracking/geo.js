function toRad(d) {
  return (d * Math.PI) / 180;
}

const { isInvalidCoord } = require('./coord-utils');

function coordsOf(p) {
  if (!p) return null;
  const lat = p.lat ?? p.map?.lat;
  const lng = p.lng ?? p.map?.lng;
  if (lat == null || lng == null) return null;
  if (isInvalidCoord(lat, lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

function haversineKm(a, b) {
  const ca = coordsOf(a);
  const cb = coordsOf(b);
  if (!ca || !cb) return null;
  const R = 6371;
  const dLat = toRad(cb.lat - ca.lat);
  const dLng = toRad(cb.lng - ca.lng);
  const lat1 = toRad(ca.lat);
  const lat2 = toRad(cb.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

function haversineMeters(a, b) {
  const km = haversineKm(a, b);
  return km == null ? null : Math.round(km * 1000);
}

function haversineMetersLatLng(lat1, lng1, lat2, lng2) {
  return haversineMeters({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
}

function pathDistanceKm(points) {
  if (!points || points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineKm(points[i - 1], points[i]);
    if (d != null) total += d;
  }
  return Math.round(total * 10) / 10;
}

function googleMapsPoint(lat, lng, label) {
  if (lat == null || lng == null) return null;
  const q = `${lat},${lng}`;
  return {
    lat: Number(lat),
    lng: Number(lng),
    label: label || q,
    url: `https://www.google.com/maps?q=${encodeURIComponent(q)}`,
  };
}

/** Driving route between alert point A and point B (from → to). */
function googleMapsRoute(from, to) {
  const a = coordsOf(from);
  const b = coordsOf(to);
  if (!a || !b) return null;
  const origin = `${a.lat},${a.lng}`;
  const dest = `${b.lat},${b.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function theftLevel(litres) {
  const l = Number(litres) || 0;
  if (l >= 60) return { level: 'critical', label: 'Critical theft' };
  if (l >= 30) return { level: 'high', label: 'High theft' };
  if (l >= 15) return { level: 'medium', label: 'Medium theft' };
  return { level: 'low', label: 'Low theft' };
}

const STALE_CONTEXT_LABELS = {
  parked_stale: 'Parked — sensor frozen',
  driving_stale: 'Moving — sensor not updating',
  offline_stale: 'Offline gap — sensor frozen',
  offline_return_stale: 'Returned after offline — sensor changed',
  tamper_resume_parked: 'Parked after tamper — fuel updated',
  tamper_resume_driving: 'Driving after tamper — fuel updated',
};

module.exports = {
  coordsOf,
  haversineKm,
  haversineMeters,
  haversineMetersLatLng,
  pathDistanceKm,
  googleMapsPoint,
  googleMapsRoute,
  formatDuration,
  theftLevel,
  STALE_CONTEXT_LABELS,
};
