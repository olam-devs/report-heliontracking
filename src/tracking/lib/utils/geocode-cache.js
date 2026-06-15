/**
 * Reverse geocode cache (Nominatim) — same idea as fleet Live Map.
 */
const fs = require('fs');
const path = require('path');

const FILE = process.env.GEOCODE_CACHE_FILE || path.join(__dirname, '../../../../data/geocode-cache.json');
const mem = new Map();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const [k, v] of Object.entries(raw || {})) mem.set(k, v);
    }
  } catch (_) {}
}

function save() {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj = Object.fromEntries(mem.entries());
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(obj));
    fs.renameSync(FILE + '.tmp', FILE);
  } catch (_) {}
}

function key(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
}

function pickName(data) {
  const a = data?.address || {};
  return (
    data?.name
    || [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village]
      .filter(Boolean)
      .join(', ')
    || data?.display_name?.split(',').slice(0, 3).join(',')
    || null
  );
}

async function fetchName(lat, lng) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}` +
    '&zoom=16&accept-language=en';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HelionReportPortal/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return pickName(data);
}

async function resolve(lat, lng) {
  if (lat == null || lng == null || Math.abs(lat) < 0.001) return null;
  load();
  const k = key(lat, lng);
  if (mem.has(k)) return mem.get(k) || null;
  try {
    const name = await fetchName(lat, lng);
    mem.set(k, name || '');
    if (mem.size % 20 === 0) save();
    return name;
  } catch {
    return null;
  }
}

function resolveSync(lat, lng) {
  load();
  const k = key(lat, lng);
  const v = mem.get(k);
  return v || null;
}

module.exports = { resolve, resolveSync, key };
