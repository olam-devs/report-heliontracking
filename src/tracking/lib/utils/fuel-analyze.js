/**
 * Fuel level analysis from GPS track points (yl ÷ 100 = litres).
 * Mirrors frontend/src/fleet/fuelUtils.js for server-side reports.
 */

function normalizeFuelPoints(raw) {
  const infos = raw?.infos || raw?.list || raw?.obj || (Array.isArray(raw) ? raw : []);
  return infos
    .map((r) => {
      const timeStr = r.gt || r.gpsTime || r.time || r.t || '';
      const ts = timeStr ? new Date(String(timeStr).replace(' ', 'T')).getTime() : NaN;
      const accRaw = r.ac != null ? r.ac : r.accOn != null ? (r.accOn ? 1 : 0) : null;
      const latRaw = r.lat ?? r.latitude ?? r.mlat;
      const lngRaw = r.lng ?? r.lon ?? r.longitude ?? r.mlng;
      const lat = latRaw != null ? Number(latRaw) : null;
      const lng = lngRaw != null ? Number(lngRaw) : null;
      const scaledLat = lat != null && Math.abs(lat) > 90 ? lat / 1e6 : lat;
      const scaledLng = lng != null && Math.abs(lng) > 180 ? lng / 1e6 : lng;
      return {
        time: ts,
        timeStr,
        fuel: r.yl != null ? r.yl / 100 : r.fuelValue ?? r.oil ?? null,
        speed: r.sp != null ? r.sp / 10 : r.speed ?? 0,
        mileage: r.lc != null ? r.lc / 1000 : r.mileage ?? 0,
        accOn: accRaw != null ? (accRaw & 1) === 1 : null,
        lat: scaledLat,
        lng: scaledLng,
      };
    })
    .filter((r) => !isNaN(r.time) && r.fuel != null)
    .sort((a, b) => a.time - b.time);
}

function detectFuelEvents(data, refuelThreshold = 20, dropThreshold = 20) {
  const events = [];
  for (let i = 1; i < data.length; i++) {
    const delta = data[i].fuel - data[i - 1].fuel;
    if (delta >= refuelThreshold) {
      events.push({
        time: data[i].time,
        timeStr: data[i].timeStr,
        type: 'refuel',
        litres: Math.round(delta * 10) / 10,
        fuelBefore: data[i - 1].fuel,
        fuelAfter: data[i].fuel,
        speed: data[i].speed,
        accOn: data[i].accOn,
      });
    } else if (Math.abs(delta) >= dropThreshold && delta < 0) {
      events.push({
        time: data[i].time,
        timeStr: data[i].timeStr,
        type: 'drop',
        litres: Math.round(Math.abs(delta) * 10) / 10,
        fuelBefore: data[i - 1].fuel,
        fuelAfter: data[i].fuel,
        speed: data[i].speed,
        accOn: data[i].accOn,
        fromPoint: {
          time: data[i - 1].time,
          timeStr: data[i - 1].timeStr,
          fuel: data[i - 1].fuel,
          lat: data[i - 1].lat,
          lng: data[i - 1].lng,
          speed: data[i - 1].speed,
        },
        toPoint: {
          time: data[i].time,
          timeStr: data[i].timeStr,
          fuel: data[i].fuel,
          lat: data[i].lat,
          lng: data[i].lng,
          speed: data[i].speed,
        },
      });
    }
  }
  return events;
}

function totalConsumption(data) {
  if (data.length < 2) return 0;
  let used = 0;
  for (let i = 1; i < data.length; i++) {
    const delta = data[i - 1].fuel - data[i].fuel;
    if (delta > 0) used += delta;
  }
  return Math.round(used * 10) / 10;
}

function buildAutoNotes({ plate, devIdno, live, fuelSeries, fuelEvents, alarms, dropThresholdL }) {
  const lines = [];
  const now = new Date().toISOString();

  if (live) {
    const on = live.online ? 'online' : 'offline';
    const acc = live.accOn === true ? 'engine ON' : live.accOn === false ? 'engine OFF' : 'ACC unknown';
    lines.push(`Live (${now.slice(11, 16)}): ${on}, ${acc}, speed ${live.speed ?? 0} km/h.`);
    if (live.fuel != null) lines.push(`Fuel now: ${live.fuel} L.`);
    if (live.gpsTime) lines.push(`Last GPS: ${live.gpsTime}.`);
  }

  if (fuelSeries.length >= 2) {
    const start = fuelSeries[0];
    const end = fuelSeries[fuelSeries.length - 1];
    const used = totalConsumption(fuelSeries);
    lines.push(
      `Fuel period: ${start.fuel} L → ${end.fuel} L; estimated consumption ${used} L (${start.timeStr || ''} – ${end.timeStr || ''}).`,
    );
  } else if (fuelSeries.length === 1) {
    lines.push(`Single fuel reading: ${fuelSeries[0].fuel} L at ${fuelSeries[0].timeStr || ''}.`);
  }

  const drops = fuelEvents.filter((e) => e.type === 'drop');
  const refuels = fuelEvents.filter((e) => e.type === 'refuel');
  if (drops.length) {
    lines.push(
      `${drops.length} sharp drop(s) ≥ ${dropThresholdL} L: ${drops
        .map((d) => `−${d.litres} L at ${d.timeStr || new Date(d.time).toISOString()}`)
        .join('; ')}.`,
    );
  }
  if (refuels.length) {
    lines.push(
      `${refuels.length} refill(s): ${refuels.map((r) => `+${r.litres} L at ${r.timeStr || ''}`).join('; ')}.`,
    );
  }

  if (alarms?.length) {
    lines.push(`${alarms.length} alarm(s) in selected period.`);
  }

  if (!lines.length) {
    lines.push(`No CMS data for ${plate || devIdno} in this period.`);
  }

  return lines.join(' ');
}

module.exports = {
  normalizeFuelPoints,
  detectFuelEvents,
  totalConsumption,
  buildAutoNotes,
};
