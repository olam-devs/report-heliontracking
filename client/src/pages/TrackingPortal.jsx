import { useState, useEffect, useCallback } from "react";
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import useTrackingAccess from "../tracking/useTrackingAccess.js";
import DailyReport from "../tracking/DailyReport.jsx";
import { isUnknownPoint } from "../tracking/coordUtils.js";

const tabClass = ({ isActive }) =>
  `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
    isActive ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800"
  }`;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromTs(date) {
  return `${date || todayStr()}T00:00`;
}

function defaultToTs(date) {
  return `${date || todayStr()}T23:59`;
}

function Placeholder({ title, children }) {
  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto w-full">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">{title}</h1>
      {children}
    </div>
  );
}

function LocationLink({ point, label }) {
  if (isUnknownPoint(point)) {
    return <span className="text-amber-800 text-sm font-medium">Unknown location (invalid GPS)</span>;
  }
  const url = point?.mapsUrl || point?.map?.url;
  if (!url) return <span className="text-gray-400">—</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline text-sm break-all">
      {label || point.placeName || `${point.lat?.toFixed?.(5)}, ${point.lng?.toFixed?.(5)}`}
    </a>
  );
}

function SegmentRow({ label, seg }) {
  if (!seg) return null;
  return (
    <div className="text-xs text-gray-700 border border-gray-200 rounded-md p-2 bg-white/60">
      <div className="font-semibold text-gray-800 mb-1">{label}</div>
      <div className="flex flex-wrap gap-3">
        {seg.fuelUsed != null && <span><strong>Fuel:</strong> {seg.fuelUsed}L</span>}
        {seg.distanceKm != null && <span><strong>Distance:</strong> {seg.distanceKm} km</span>}
        {seg.duration && <span><strong>Time:</strong> {seg.duration}</span>}
      </div>
      {seg.mapsRouteUrl && (
        <a href={seg.mapsRouteUrl} target="_blank" rel="noreferrer" className="inline-block mt-2 text-brand-600 hover:underline">
          Route in Google Maps
        </a>
      )}
    </div>
  );
}

function AlertCard({ alert }) {
  const sevColors = {
    critical: "border-red-400 bg-red-50",
    high: "border-orange-400 bg-orange-50",
    medium: "border-amber-400 bg-amber-50",
    low: "border-yellow-300 bg-yellow-50",
    warning: "border-purple-300 bg-purple-50",
  };
  const cls = sevColors[alert.severity] || "border-gray-200 bg-white";
  const routeUrl = alert.mapsRouteUrl;
  const segs = alert.segments || {};
  const fmtFuel = (pt) => {
    const f = pt?.fuel;
    if (f == null) return "Unknown";
    const n = Number(f);
    if (!Number.isFinite(n) || n <= 5) return "Unknown";
    return `${n}L`;
  };
  const theft = alert.theft || null;

  return (
    <div className={`border rounded-lg p-4 ${cls}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold text-gray-900">{alert.plate}</div>
          <div className="text-xs text-gray-500">
            {alert.kind?.replace(/_/g, " ")}
            {alert.contextLabel ? ` · ${alert.contextLabel}` : ""}
            {" · "}{alert.at}
          </div>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded bg-white/80 border">
          {alert.severityLabel || alert.severity}
        </span>
      </div>

      {alert.litres != null && alert.kind !== "stale_sensor" && (
        <div className="text-sm mb-2">
          <strong>Fuel change:</strong> {alert.fuelBefore}L → {alert.fuelAfter}L
          <span> (−{alert.litres}L)</span>
        </div>
      )}

      {theft && alert.kind !== "stale_sensor" && (
        <div className="text-xs text-gray-700 mb-2">
          <strong>Theft points:</strong> {theft.fromLabel} → {theft.toLabel} (−{theft.litres}L)
        </div>
      )}

      {alert.kind === "stale_sensor" && (
        <div className="text-sm mb-2 space-y-1">
          <div>Sensor frozen at <strong>{alert.litresFrozen}L</strong> → resumed <strong>{alert.litresResumed}L</strong></div>
          {alert.offlineGapLabel && (
            <div className="text-xs text-gray-600">Offline gap: {alert.offlineGapLabel}</div>
          )}
          {alert.maxSpeedKmh != null && (
            <div className="text-xs text-gray-600">Max speed while frozen: {alert.maxSpeedKmh} km/h</div>
          )}
        </div>
      )}

      <div className={`grid gap-3 text-sm ${(alert.pointA0 && alert.pointC) ? "md:grid-cols-4" : (alert.pointA0 || alert.pointC) ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {alert.pointA0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Point A0 (prev valid)</div>
            <LocationLink point={alert.pointA0} />
            <div className="text-xs text-gray-500 mt-1">{alert.pointA0?.timeStr}</div>
            <div className="text-xs text-gray-700 mt-1"><strong>Fuel:</strong> {fmtFuel(alert.pointA0)}</div>
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Point A (from)</div>
          <LocationLink point={alert.from} />
          <div className="text-xs text-gray-500 mt-1">{alert.from?.timeStr}</div>
          <div className="text-xs text-gray-700 mt-1"><strong>Fuel:</strong> {fmtFuel(alert.from)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
            Point B (to){isUnknownPoint(alert.to) ? " — unknown" : ""}
          </div>
          <LocationLink point={alert.to} />
          <div className="text-xs text-gray-500 mt-1">{alert.to?.timeStr}</div>
          <div className="text-xs text-gray-700 mt-1"><strong>Fuel:</strong> {fmtFuel(alert.to)}</div>
        </div>
        {alert.pointC && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Point C (next valid GPS)</div>
            <LocationLink point={alert.pointC} />
            <div className="text-xs text-gray-500 mt-1">{alert.pointC?.timeStr}</div>
            <div className="text-xs text-gray-700 mt-1"><strong>Fuel:</strong> {fmtFuel(alert.pointC)}</div>
          </div>
        )}
      </div>

      {isUnknownPoint(alert.to) && (
        <div className="mt-3 text-xs text-gray-700 border border-amber-200 bg-amber-50/60 rounded-md p-2">
          <div className="font-semibold text-amber-900 mb-1">Point B has invalid GPS</div>
          <div className="flex flex-wrap gap-3">
            <span><strong>Fuel @A:</strong> {fmtFuel(alert.from)}</span>
            <span><strong>Fuel @B:</strong> {fmtFuel(alert.to)}</span>
            {segs.aToB?.fuelUsed != null && <span><strong>A→B fuel used:</strong> {segs.aToB.fuelUsed}L</span>}
          </div>
        </div>
      )}

      {(segs.a0ToA || segs.aToB || segs.aToC || segs.bToC || segs.a0ToC) && (
        <div className="mt-3 grid md:grid-cols-3 gap-2">
          {segs.a0ToA && <SegmentRow label="A0 → A fuel & route" seg={segs.a0ToA} />}
          <SegmentRow label="A → B fuel & route" seg={segs.aToB} />
          {segs.aToC && <SegmentRow label="A → C fuel & route" seg={segs.aToC} />}
          {segs.bToC && <SegmentRow label="B → C fuel & route" seg={segs.bToC} />}
          {segs.a0ToC && <SegmentRow label="A0 → C fuel & route" seg={segs.a0ToC} />}
        </div>
      )}

      <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-600">
        {alert.distanceKm != null && <span><strong>Distance (A→B):</strong> {alert.distanceKm} km</span>}
        {alert.duration && <span><strong>Time (A→B):</strong> {alert.duration}</span>}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {routeUrl && !isUnknownPoint(alert.to) && (
          <a href={routeUrl} target="_blank" rel="noreferrer" className="inline-flex text-sm btn btn-primary py-1.5 px-3">
            View route A → B
          </a>
        )}
        {alert.mapsRouteAtoCUrl && (
          <a href={alert.mapsRouteAtoCUrl} target="_blank" rel="noreferrer" className="text-xs btn btn-secondary py-1.5 px-2">
            Route A → C
          </a>
        )}
        {alert.mapsRouteBtoCUrl && (
          <a href={alert.mapsRouteBtoCUrl} target="_blank" rel="noreferrer" className="text-xs btn btn-secondary py-1.5 px-2">
            Route B → C
          </a>
        )}
        {alert.mapsFromUrl && (
          <a href={alert.mapsFromUrl} target="_blank" rel="noreferrer" className="text-xs btn btn-secondary py-1.5 px-2">
            Point A
          </a>
        )}
        {!isUnknownPoint(alert.to) && alert.mapsToUrl && (
          <a href={alert.mapsToUrl} target="_blank" rel="noreferrer" className="text-xs btn btn-secondary py-1.5 px-2">
            Point B
          </a>
        )}
        {alert.mapsPointCUrl && (
          <a href={alert.mapsPointCUrl} target="_blank" rel="noreferrer" className="text-xs btn btn-secondary py-1.5 px-2">
            Point C
          </a>
        )}
      </div>
    </div>
  );
}

export function TrackingFuelAlerts() {
  const { canEdit } = useTrackingAccess();
  const canRun = canEdit("fuel_alerts");
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  const [fromTs, setFromTs] = useState(() => defaultFromTs(todayStr()));
  const [toTs, setToTs] = useState(() => defaultToTs(todayStr()));
  const [plate, setPlate] = useState("");
  const [threshold, setThreshold] = useState(20);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState("");
  const [appliedThreshold, setAppliedThreshold] = useState(null);

  useEffect(() => {
    import("../tracking/api.js").then(({ apiFetch }) => {
      apiFetch("/settings").then((s) => {
        if (s?.defaultDropThresholdL) setThreshold(s.defaultDropThresholdL);
      }).catch(() => {});
    });
  }, []);

  useEffect(() => {
    setFromTs((prev) => `${from}T${prev.split("T")[1] || "00:00"}`);
  }, [from]);

  useEffect(() => {
    setToTs((prev) => `${to}T${prev.split("T")[1] || "23:59"}`);
  }, [to]);

  const saveThreshold = async (val) => {
    const { apiFetch } = await import("../tracking/api.js");
    await apiFetch("/settings", { method: "PATCH", body: { defaultDropThresholdL: val } });
  };

  const run = async () => {
    if (!canRun) return;
    setLoading(true);
    setError("");
    try {
      const { apiFetch } = await import("../tracking/api.js");
      const q = new URLSearchParams({ from, to, fromTs, toTs, dropThresholdL: String(threshold) });
      if (plate.trim()) q.set("plate", plate.trim());
      const data = await apiFetch(`/analytics/run?${q}`, { method: "POST", timeoutMs: 600000 });
      setAlerts(data.alerts || []);
      setAppliedThreshold(data.dropThresholdL ?? threshold);
      saveThreshold(threshold).catch(() => {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Placeholder title="Fuel drops & theft analysis">
      <p className="text-sm text-gray-600 mb-4">
        Query GPS + fuel history from CMS. Each alert shows <strong>Point A → Point B</strong> with distance, time, and Google Maps route.
        Uses your <strong>drop threshold (L)</strong> — only drops at or above this value are shown (includes stale-sensor cases).
      </p>
      <div className="card p-4 mb-4 grid md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label className="label">From date</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">From time</label>
          <input type="time" className="input" value={fromTs.split("T")[1] || "00:00"} onChange={(e) => setFromTs(`${from}T${e.target.value}`)} />
        </div>
        <div>
          <label className="label">To date</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">To time</label>
          <input type="time" className="input" value={toTs.split("T")[1] || "23:59"} onChange={(e) => setToTs(`${to}T${e.target.value}`)} />
        </div>
        <div>
          <label className="label">Vehicle plate (optional)</label>
          <input className="input" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="All vehicles" />
        </div>
        <div>
          <label className="label">Drop threshold (L)</label>
          <input type="number" min={1} step={1} className="input" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </div>
        <button type="button" className="btn btn-primary md:col-span-3 lg:col-span-6" onClick={run} disabled={loading || !canRun}>
          {loading ? "Querying CMS GPS + fuel…" : canRun ? "Run analysis" : "View only — cannot run analysis"}
        </button>
      </div>
      {appliedThreshold != null && (
        <p className="text-xs text-gray-500 mb-3">Results filtered at ≥ <strong>{appliedThreshold}L</strong> drop threshold.</p>
      )}
      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
      <div className="space-y-3">
        {alerts.length === 0 && !loading && <p className="text-gray-500 text-sm">No alerts for this period — try a wider range or lower threshold.</p>}
        {alerts.map((a) => <AlertCard key={a.id} alert={a} />)}
      </div>
    </Placeholder>
  );
}

export function TrackingNotifications() {
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  const [fromTs, setFromTs] = useState(() => defaultFromTs(todayStr()));
  const [toTs, setToTs] = useState(() => defaultToTs(todayStr()));
  const [plate, setPlate] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState("");
  const [backfillNote, setBackfillNote] = useState("");

  useEffect(() => {
    setFromTs((prev) => `${from}T${prev.split("T")[1] || "00:00"}`);
  }, [from]);

  useEffect(() => {
    setToTs((prev) => `${to}T${prev.split("T")[1] || "23:59"}`);
  }, [to]);

  const load = useCallback(async () => {
    setLoading(true);
    setBackfillNote("");
    try {
      const { apiFetch } = await import("../tracking/api.js");
      const q = new URLSearchParams({ from, to, fromTs, toTs, backfill: "1" });
      if (plate.trim()) q.set("plate", plate.trim());
      const data = await apiFetch(`/notifications?${q}`);
      setItems(data.items || []);
      const n = data.items?.length || 0;
      const scope = plate.trim() ? `${plate.trim()} · ` : "Fleet · ";
      setSummary(`${scope}${from} ${fromTs.split("T")[1]} → ${to} ${toTs.split("T")[1]} — ${n} serious alert(s) (≥10L theft)`);
      const bf = data.backfill;
      if (bf?.backfilled && !bf?.skipped) {
        setBackfillNote(`Queried CMS for ${bf.begintime} → ${bf.endtime}; ${bf.added ?? 0} new alert(s) saved.`);
      } else if (bf?.reason === "already_covered") {
        setBackfillNote("Loaded from saved notification history.");
      }
      await apiFetch("/notifications/mark-seen", { method: "POST" });
      window.dispatchEvent(new CustomEvent("tracking-notifications-seen"));
    } catch {
      setItems([]);
      setSummary("");
      setBackfillNote("");
    } finally {
      setLoading(false);
    }
  }, [from, to, fromTs, toTs, plate]);

  useEffect(() => {
    load();
  }, []);

  return (
    <Placeholder title="Serious fuel theft notifications">
      <p className="text-sm text-gray-600 mb-4">
        Auto-saved alerts for fuel drops <strong>≥ 10L</strong> (theft suspicion). Past dates are loaded from CMS on first request, then kept in history.
      </p>
      <div className="card p-4 mb-4 grid md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label className="label">From date</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">From time</label>
          <input type="time" className="input" value={fromTs.split("T")[1] || "00:00"} onChange={(e) => setFromTs(`${from}T${e.target.value}`)} />
        </div>
        <div>
          <label className="label">To date</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">To time</label>
          <input type="time" className="input" value={toTs.split("T")[1] || "23:59"} onChange={(e) => setToTs(`${to}T${e.target.value}`)} />
        </div>
        <div>
          <label className="label">Plate (optional)</label>
          <input className="input" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="All vehicles" />
        </div>
        <button type="button" className="btn btn-primary" onClick={load} disabled={loading}>
          {loading ? "Querying CMS…" : "Load alerts"}
        </button>
      </div>
      {loading && <p className="text-sm text-indigo-700 mb-3">Loading alerts — historical ranges may query CMS for each vehicle (this can take several minutes).</p>}
      {backfillNote && !loading && <p className="text-sm text-gray-600 mb-3">{backfillNote}</p>}
      {summary && <p className="text-sm font-medium text-gray-700 mb-3">{summary}</p>}
      <div className="space-y-3">
        {items.length === 0 && !loading && <p className="text-gray-500 text-sm">No serious theft notifications in this range.</p>}
        {items.map((a) => <AlertCard key={a.id} alert={a} />)}
      </div>
    </Placeholder>
  );
}

export function TrackingCalibration() {
  const { canEdit } = useTrackingAccess();
  const canEditCalibration = canEdit("calibration");
  const [vehicles, setVehicles] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { apiFetch } = await import("../tracking/api.js");
      const list = await apiFetch("/vehicles");
      setVehicles(list || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (v) => {
    const next = !v.fuelCalibrated;
    setSavingId(v.devIdno);
    setError("");
    setVehicles((prev) =>
      prev.map((row) =>
        row.devIdno === v.devIdno ? { ...row, fuelCalibrated: next } : row,
      ),
    );
    try {
      const { apiFetch } = await import("../tracking/api.js");
      const meta = await apiFetch(`/daily-log/report/${v.devIdno}`, {
        method: "PATCH",
        body: { fuelCalibrated: next, plate: v.plate },
      });
      setVehicles((prev) =>
        prev.map((row) =>
          row.devIdno === v.devIdno
            ? {
                ...row,
                fuelCalibrated: meta?.fuelCalibrated !== false && meta?.fuelSensorCalibrated !== false,
              }
            : row,
        ),
      );
      if (!next) {
        window.dispatchEvent(new CustomEvent("tracking-notifications-seen"));
      }
    } catch (e) {
      setError(e.message);
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const filtered = vehicles.filter((v) => {
    const s = q.replace(/\s+/g, "").toLowerCase();
    if (!s) return true;
    return String(v.plate || "").replace(/\s+/g, "").toLowerCase().includes(s);
  });

  return (
    <Placeholder title="Fuel sensor calibration">
      {!canEditCalibration && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          View-only access — you cannot change calibration settings.
        </p>
      )}
      <p className="text-sm text-gray-600 mb-4">
        Mark vehicles as <strong className="text-red-700">not calibrated</strong> to exclude them from fuel theft notifications and fuel alert analysis.
        Their existing notifications are removed immediately.
      </p>
      {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
      <input className="input max-w-sm mb-4" placeholder="Search plate…" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading ? <p>Loading…</p> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-3">Plate</th>
                <th className="p-3">Device</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const calibrated = v.fuelCalibrated !== false;
                const busy = savingId === v.devIdno;
                return (
                  <tr key={v.devIdno} className="border-t border-gray-100">
                    <td className="p-3 font-medium">{v.plate}</td>
                    <td className="p-3 text-gray-500 font-mono text-xs">{v.devIdno}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          calibrated
                            ? "bg-green-100 text-green-800 border border-green-300"
                            : "bg-red-100 text-red-800 border border-red-300"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${calibrated ? "bg-green-600" : "bg-red-600"}`} />
                        {calibrated ? "Calibrated" : "Not calibrated — excluded"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        disabled={busy || !canEditCalibration}
                        onClick={() => toggle(v)}
                        className={`text-xs py-1.5 px-3 rounded-md font-semibold text-white transition-colors disabled:opacity-50 ${
                          calibrated
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-green-600 hover:bg-green-700"
                        }`}
                      >
                        {busy ? "Saving…" : calibrated ? "Mark not calibrated" : "Mark calibrated"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Placeholder>
  );
}

export function TrackingDangerZones() {
  const { canEdit } = useTrackingAccess();
  const canEditDz = canEdit("danger_zones");
  const [points, setPoints] = useState([]);
  const [radiusM, setRadiusM] = useState(100);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [linked, setLinked] = useState([]);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { apiFetch } = await import("../tracking/api.js");
      const data = await apiFetch("/danger-zones");
      setPoints(data.items || []);
      setRadiusM(data.radiusM || 100);
    } catch {
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectPoint = async (p) => {
    setSelected(p);
    setEditName(p.name || "");
    setLinkedLoading(true);
    try {
      const { apiFetch } = await import("../tracking/api.js");
      const data = await apiFetch(`/danger-zones/${encodeURIComponent(p.id)}/notifications`);
      setLinked(data.items || []);
      setRadiusM(data.radiusM || 100);
    } catch {
      setLinked([]);
    } finally {
      setLinkedLoading(false);
    }
  };

  const saveName = async () => {
    if (!selected || !canEditDz) return;
    setSaving(true);
    try {
      const { apiFetch } = await import("../tracking/api.js");
      const updated = await apiFetch(`/danger-zones/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        body: { name: editName },
      });
      setSelected(updated);
      setPoints((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } finally {
      setSaving(false);
    }
  };

  const filtered = points.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [p.name, p.firstSeenAt, p.firstSeenDate, p.lat, p.lng].some((v) => String(v ?? "").toLowerCase().includes(s));
  });

  const mapUrl = (p) => (p.lat != null && p.lng != null
    ? `https://www.google.com/maps/@${p.lat},${p.lng},17z`
    : null);

  const fmtFirstSeen = (p) => p.firstSeenDate || String(p.firstSeenAt || "").slice(0, 10) || "—";

  return (
    <Placeholder title="Danger zones">
      <p className="text-sm text-gray-600 mb-4">
        Theft alert locations are merged into <strong>{radiusM}m</strong> danger zones.
        A new point within {radiusM}m of an existing zone is recorded under that zone (first-seen date kept).
        Click a zone to see notifications with any point within its radius — some alerts may match two nearby zones.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <input className="input max-w-xs" placeholder="Search location…" value={q} onChange={(e) => setQ(e.target.value)} />
        {canEditDz && (
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={async () => {
              const { apiFetch } = await import("../tracking/api.js");
              await apiFetch("/danger-zones/rebuild", { method: "POST" });
              await load();
            }}
          >
            Rebuild from notifications
          </button>
        )}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card overflow-hidden max-h-[70vh] overflow-y-auto">
          {loading ? <p className="p-4 text-sm">Loading…</p> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left sticky top-0">
                <tr>
                  <th className="p-2">Location</th>
                  <th className="p-2">First seen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-t border-gray-100 cursor-pointer hover:bg-red-50 ${selected?.id === p.id ? "bg-red-50" : ""}`}
                    onClick={() => selectPoint(p)}
                  >
                    <td className="p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold uppercase">
                          {p.radiusM || radiusM}m
                        </span>
                        <span className="font-medium text-gray-900">
                          {p.name || `${p.lat?.toFixed?.(5)}, ${p.lng?.toFixed?.(5)}`}
                        </span>
                      </div>
                      {mapUrl(p) && (
                        <a href={mapUrl(p)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                          Open map (100m area)
                        </a>
                      )}
                      {p.hitCount > 1 && (
                        <div className="text-gray-500 mt-0.5">{p.hitCount} events in this zone</div>
                      )}
                    </td>
                    <td className="p-2 text-xs text-gray-600 whitespace-nowrap">{fmtFirstSeen(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && filtered.length === 0 && <p className="p-4 text-gray-500 text-sm">No danger zone points yet.</p>}
        </div>
        <div className="card p-4 min-h-[200px]">
          {!selected && <p className="text-gray-500 text-sm">Select a danger zone to view nearby notifications.</p>}
          {selected && (
            <>
              <div className="mb-3">
                <div className="font-semibold text-gray-900">{selected.name || `${selected.lat?.toFixed?.(5)}, ${selected.lng?.toFixed?.(5)}`}</div>
                <div className="text-xs text-gray-500 mt-1">
                  <span className="inline-flex px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-semibold mr-2">{selected.radiusM || radiusM}m radius</span>
                  First seen: <strong>{fmtFirstSeen(selected)}</strong>
                  {selected.hitCount > 1 && ` · ${selected.hitCount} merged events`}
                </div>
                {canEditDz ? (
                  <div className="flex gap-2 mt-2">
                    <input className="input flex-1 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Display name" />
                    <button type="button" className="btn btn-primary text-sm" disabled={saving} onClick={saveName}>
                      {saving ? "Saving…" : "Save name"}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm mt-2">{selected.name || "—"}</p>
                )}
              </div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Notifications within {selected.radiusM || radiusM}m {linkedLoading && "(loading…)"}
              </p>
              <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                {linked.map((a) => <AlertCard key={a.id} alert={a} />)}
                {!linkedLoading && linked.length === 0 && (
                  <p className="text-gray-500 text-sm">No matching notifications.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Placeholder>
  );
}

export default function TrackingPortal() {
  const { canTrack, canView, firstAllowedPath } = useTrackingAccess();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  const pageForPath = (path) => {
    if (path.includes("/fuel-alerts")) return "fuel_alerts";
    if (path.includes("/notifications")) return "notifications";
    if (path.includes("/calibration")) return "calibration";
    if (path.includes("/danger-zones")) return "danger_zones";
    return "daily_report";
  };

  const currentPage = pageForPath(location.pathname);
  if (canTrack && !canView(currentPage)) {
    return <Navigate to={firstAllowedPath()} replace />;
  }

  useEffect(() => {
    if (!canTrack || !canView("notifications")) return undefined;
    const load = async () => {
      try {
        const { apiFetch } = await import("../tracking/api.js");
        const data = await apiFetch("/notifications/unread-count");
        setUnread(data?.unread ?? 0);
      } catch {
        setUnread(0);
      }
    };
    load();
    const onSeen = () => setUnread(0);
    window.addEventListener("tracking-notifications-seen", onSeen);
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("tracking-notifications-seen", onSeen);
      clearInterval(id);
    };
  }, [canTrack, canView]);

  if (!canTrack) return <Navigate to="/drivers" replace />;

  const notifTabClass = ({ isActive }) =>
    `${tabClass({ isActive })} relative`;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="border-b border-gray-200 bg-white px-4 flex gap-1 shrink-0 overflow-x-auto">
        {canView("daily_report") && <NavLink to="/tracking" end className={tabClass}>Daily fleet report</NavLink>}
        {canView("fuel_alerts") && <NavLink to="/tracking/fuel-alerts" className={tabClass}>Fuel alerts</NavLink>}
        {canView("notifications") && (
          <NavLink to="/tracking/notifications" className={notifTabClass}>
            Notifications
            {unread > 0 && (
              <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </NavLink>
        )}
        {canView("calibration") && <NavLink to="/tracking/calibration" className={tabClass}>Calibration</NavLink>}
        {canView("danger_zones") && <NavLink to="/tracking/danger-zones" className={tabClass}>Danger zones</NavLink>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

export function TrackingDailyReport() {
  const { canEdit } = useTrackingAccess();
  return (
    <div className="h-full min-h-0 flex flex-col" style={{ height: "calc(100vh - 49px)" }}>
      <DailyReport readOnly={!canEdit("daily_report")} />
    </div>
  );
}
