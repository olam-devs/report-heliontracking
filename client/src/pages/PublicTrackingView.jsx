import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";

const POLL_MS = 8000;
const BASE = import.meta.env.VITE_API_URL || "";

async function fetchLink(token) {
  const res = await fetch(`${BASE}/api/dispatch/public/${token}`);
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), json);
  return json;
}

function agoLabel(ts) {
  if (!ts) return null;
  const ms = Date.now() - new Date(ts).getTime();
  if (isNaN(ms) || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m ago` : `${Math.floor(h / 24)}d ago`;
}

function groupVehicles(vehicles) {
  const groups = {};
  for (const v of vehicles) {
    const g = v.group || "All vehicles";
    if (!groups[g]) groups[g] = [];
    groups[g].push(v);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

function useMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

const T = {
  bg: "#f9fafb", panel: "#ffffff", border: "#e5e7eb",
  text: "#111827", textSoft: "#6b7280", muted: "#9ca3af",
  accent: "#16a34a", accentSoft: "#dcfce7",
  green: "#16a34a", orange: "#ea580c", red: "#dc2626",
  panelBright: "#f3f4f6",
};

export default function PublicTrackingView() {
  const { token } = useParams();
  const isMobile = useMobile();

  const [linkName, setLinkName] = useState("");
  const [endsAt, setEndsAt] = useState(null);
  const [allVehicles, setAllVehicles] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [drawerSnap, setDrawerSnap] = useState('half');
  const [state, setState] = useState('loading'); // loading | active | not_started | expired | error
  const [stateDetail, setStateDetail] = useState(null);

  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef({});
  const pollRef = useRef(null);
  const mapInitRef = useRef(false);

  // Initial load
  useEffect(() => {
    fetchLink(token).then(json => {
      const vehicles = json.data || [];
      setLinkName(json.name || "Tracking");
      setEndsAt(json.ends_at);
      setAllVehicles(vehicles);
      setExpandedGroups(new Set(vehicles.map(v => v.group || "All vehicles")));
      // auto-select + start all
      const ids = new Set(vehicles.map(v => v.devIdno));
      setSelected(ids);
      const byId = {};
      for (const v of vehicles) byId[v.devIdno] = v;
      setStatuses(byId);
      setState('active');
      setRunning(true);
    }).catch(err => {
      if (err.error === 'not_started') { setState('not_started'); setStateDetail(err.starts_at); }
      else if (err.error === 'expired') { setState('expired'); setStateDetail(err.ends_at); }
      else setState('error');
    });
  }, [token]);

  // Init Leaflet
  useEffect(() => {
    if (mapInitRef.current || !mapRef.current || !window.L || state !== 'active') return;
    const L = window.L;
    const map = L.map(mapRef.current, { center: [-6.8, 39.28], zoom: 11 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap", maxZoom: 19,
    }).addTo(map);
    leafletRef.current = map;
    mapInitRef.current = true;
  });

  const updateMarkers = useCallback((byId, currentSelected) => {
    const L = window.L;
    if (!L || !leafletRef.current) return;
    const map = leafletRef.current;

    for (const id of Object.keys(markersRef.current)) {
      if (!currentSelected.has(id)) { markersRef.current[id].remove(); delete markersRef.current[id]; }
    }
    const isFirst = Object.keys(markersRef.current).length === 0;
    const bounds = [];

    for (const id of currentSelected) {
      const v = byId[id];
      if (!v || v.lat == null || v.lng == null) continue;
      const online = !!v.online;
      const gpsOk = v.gpsValid && v.gpsLocked !== false;
      const unconfirmed = online && !gpsOk;
      const ago = agoLabel(v.gpsTime);
      const statusLine = !gpsOk
        ? (unconfirmed ? "Online — GPS not locked" : "GPS Invalid")
        : online ? `Online${v.speed != null ? " · " + v.speed.toFixed(0) + " km/h" : ""}` : `Offline${ago ? " · " + ago : ""}`;
      const color = unconfirmed ? "#f5a623" : !gpsOk ? "#9e9e9e" : online ? "#3daf7a" : "#f57c00";

      let labelHtml;
      if (unconfirmed) {
        labelHtml = `<div style="background:#fff3cd;color:#7c5a00;font-size:13px;font-weight:800;font-family:system-ui,sans-serif;padding:5px 11px;border-radius:12px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.35);border:2px dashed #f5a623;">${v.plate} <span style="font-size:10px;color:#c17900">GPS?</span></div>`;
      } else if (!gpsOk) {
        labelHtml = `<div style="background:#f5f5f5;color:#666;font-size:13px;font-weight:700;font-family:system-ui,sans-serif;padding:5px 10px;border-radius:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.2);border:2px solid #bbb;">${v.plate}</div>`;
      } else {
        const bc = online ? "#1e7e50" : "#c26000", tc = online ? "#1a6640" : "#9a4800";
        labelHtml = `<div style="background:#fff;color:${tc};font-size:13px;font-weight:800;font-family:system-ui,sans-serif;padding:5px 11px;border-radius:12px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.3);border:3px solid ${bc};">${v.plate}</div>`;
      }

      const movingStatus = gpsOk ? (v.speed != null && v.speed > 1 ? "Driving" : "Parked") : null;
      const locId = `pub-loc-${id}`;
      const popup = `<div style="font-family:system-ui,sans-serif;font-size:13px;min-width:160px"><b style="font-size:14px">${v.plate}</b><br/><span style="color:${color};font-weight:600">${statusLine}</span>${movingStatus ? `<br/><span style="font-size:11px;color:#444">Status: <b>${movingStatus}</b></span>` : ""}${unconfirmed ? `<br/><span style="background:#fff3cd;color:#7c5a00;font-size:11px;padding:2px 6px;border-radius:4px;">⚠ GPS not locked</span>` : ""}${gpsOk ? `<br/><span id="${locId}" style="color:#444;font-size:12px">Loading location...</span>` : ""}${v.gpsTime ? `<br/><span style="color:#999;font-size:11px">Last GPS: ${new Date(v.gpsTime).toLocaleTimeString()}</span>` : ""}</div>`;

      const icon = window.L.divIcon({ className: "", html: labelHtml, iconAnchor: [0, 0] });
      if (markersRef.current[id]) {
        markersRef.current[id].setLatLng([v.lat, v.lng]).setIcon(icon).setPopupContent(popup);
      } else {
        const marker = window.L.marker([v.lat, v.lng], { icon }).addTo(map).bindPopup(popup);
        if (gpsOk) {
          marker.on('popupopen', () => {
            fetch(`${BASE}/api/dispatch/public-geocode?lat=${v.lat}&lng=${v.lng}&token=${token}`)
              .then(r => r.json())
              .then(d => { const el = document.getElementById(locId); if (el) el.textContent = d.name || `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`; })
              .catch(() => { const el = document.getElementById(locId); if (el) el.textContent = `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`; });
          });
        }
        markersRef.current[id] = marker;
      }
      bounds.push([v.lat, v.lng]);
    }
    if (isFirst && bounds.length > 0) {
      if (bounds.length === 1) map.setView(bounds[0], 14);
      else map.fitBounds(window.L.latLngBounds(bounds), { padding: [40, 40] });
    }
  }, []);

  const poll = useCallback(async () => {
    if (selected.size === 0) return;
    try {
      const json = await fetchLink(token);
      const byId = {};
      for (const v of json.data) byId[v.devIdno] = v;
      // merge in any vehicles not in current poll (keep last known)
      setStatuses(prev => ({ ...prev, ...byId }));
      updateMarkers({ ...statuses, ...byId }, selected);
    } catch (err) {
      if (err.error === 'expired') { setRunning(false); setState('expired'); setStateDetail(err.ends_at); }
    }
  }, [token, selected, statuses, updateMarkers]);

  useEffect(() => {
    if (running && selected.size > 0) {
      pollRef.current = setInterval(poll, POLL_MS);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [running, selected, poll]);

  // Update markers when statuses or selection change
  useEffect(() => {
    if (Object.keys(statuses).length > 0) updateMarkers(statuses, selected);
  }, [statuses, selected, updateMarkers]);

  function zoomToVehicle(v) {
    const cur = statuses[v.devIdno] || v;
    if (cur?.lat != null && leafletRef.current) {
      leafletRef.current.flyTo([cur.lat, cur.lng], 16, { duration: 1 });
      markersRef.current[v.devIdno]?.openPopup();
      if (isMobile) setDrawerSnap('peek');
    }
  }

  function toggleSelect(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  const filtered = search ? allVehicles.filter(v => v.plate?.toLowerCase().includes(search.toLowerCase())) : allVehicles;
  const groups = groupVehicles(filtered);

  const drawerHeight = drawerSnap === 'full' ? '88vh' : drawerSnap === 'half' ? '48vh' : 68;

  const expiresLabel = endsAt ? new Date(endsAt).toLocaleString() : null;

  // ── Status screens ────────────────────────────────────────────────────────
  if (state === 'loading') {
    return <Screen icon="" title="Loading tracking session…" loading />;
  }
  if (state === 'not_started') {
    return <Screen icon="🕐" title="Tracking not started yet" sub={`This session begins on ${new Date(stateDetail).toLocaleString()}`} />;
  }
  if (state === 'expired') {
    return <Screen icon="⏱️" title="Tracking session ended" sub={`This session expired on ${new Date(stateDetail).toLocaleString()}`} />;
  }
  if (state === 'error') {
    return <Screen icon="❌" title="Link not found" sub="This tracking link is invalid or has been removed." />;
  }

  // ── Vehicle list ──────────────────────────────────────────────────────────
  const VehicleList = (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      {groups.map(([groupName, vehicles]) => {
        const expanded = expandedGroups.has(groupName);
        return (
          <div key={groupName}>
            {groups.length > 1 && (
              <div onClick={() => setExpandedGroups(prev => { const n = new Set(prev); n.has(groupName) ? n.delete(groupName) : n.add(groupName); return n; })}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: T.panelBright, borderBottom: `1px solid ${T.border}`, cursor: "pointer", position: "sticky", top: 0, zIndex: 1 }}>
                <span style={{ fontSize: 10, color: T.muted, display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▶</span>
                <span style={{ fontWeight: 700, fontSize: 11, color: T.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>{groupName}</span>
                <span style={{ fontSize: 10, color: T.muted, marginLeft: "auto" }}>{vehicles.length}</span>
              </div>
            )}
            {(expanded || groups.length === 1) && vehicles.map(v => {
              const st = statuses[v.devIdno];
              const isOn = st?.online;
              const gpsOk = st?.gpsValid && st?.gpsLocked !== false;
              const unconfirmed = st?.online && !gpsOk;
              const ago = agoLabel(st?.gpsTime);
              const isSelected = selected.has(v.devIdno);
              const dotColor = !st ? T.border : unconfirmed ? "#f5a623" : !gpsOk ? T.muted : isOn ? T.green : T.orange;
              return (
                <div key={v.devIdno}
                  onClick={() => toggleSelect(v.devIdno)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "12px 16px" : "9px 16px", cursor: "pointer", background: isSelected ? T.accentSoft : "transparent", borderLeft: `3px solid ${isSelected ? T.accent : "transparent"}`, borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{v.plate}</div>
                    {st ? (
                      <div style={{ fontSize: 11, color: unconfirmed ? "#c17900" : !gpsOk ? T.muted : isOn ? T.green : T.orange, marginTop: 1 }}>
                        {unconfirmed ? "⚠ GPS not locked" : !gpsOk ? "No GPS" : isOn ? `Online${st.speed != null ? ` · ${st.speed.toFixed(0)} km/h` : ""}` : `Offline${ago ? ` · ${ago}` : ""}`}
                      </div>
                    ) : <div style={{ fontSize: 11, color: T.muted }}>Waiting…</div>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); zoomToVehicle(v); }}
                    style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${T.accent}`, background: "none", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                    Zoom
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ position: "relative", width: "100%", height: "100vh", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
        <LeafletLoader />
        <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />

        {/* Top bar */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 400, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${T.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.text, lineHeight: 1.2 }}>{linkName}</div>
            {expiresLabel && <div style={{ fontSize: 10, color: T.muted }}>Expires {expiresLabel}</div>}
          </div>
          {running ? (
            <span style={{ fontSize: 11, color: T.accent, fontWeight: 700, background: T.accentSoft, padding: "3px 10px", borderRadius: 20 }}>● Live</span>
          ) : (
            <button onClick={() => setRunning(true)} style={{ padding: "6px 14px", borderRadius: 20, border: "none", background: T.accent, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Start</button>
          )}
        </div>

        {/* Bottom drawer */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 500, background: T.panel, borderRadius: "20px 20px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)", transition: "height 0.3s cubic-bezier(0.4,0,0.2,1)", height: drawerHeight, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Handle */}
          <div style={{ flexShrink: 0, padding: "10px 16px 0", cursor: "pointer" }} onClick={() => setDrawerSnap(s => s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek')}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>Vehicles ({allVehicles.length})</span>
              <div style={{ flex: 1, position: "relative" }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plate…"
                  onClick={e => { e.stopPropagation(); setDrawerSnap('full'); }}
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 20, padding: "5px 24px 5px 10px", fontSize: 12, color: T.text, background: T.bg, outline: "none" }} />
                {search && <button onMouseDown={e => { e.preventDefault(); setSearch(""); }} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.muted, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>}
              </div>
            </div>
          </div>
          {VehicleList}
        </div>
      </div>
    );
  }

  // ── DESKTOP ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
      <LeafletLoader />

      {/* Sidebar */}
      <div style={{ width: 300, minWidth: 260, background: T.panel, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: T.text, marginBottom: 2 }}>{linkName}</div>
          {expiresLabel && <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>Expires {expiresLabel}</div>}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
            {running ? (
              <>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, display: "inline-block", animation: "pulse 1.5s infinite" }} />
                <span style={{ fontSize: 12, color: T.accent, fontWeight: 700 }}>Live — updating every 8s</span>
                <button onClick={() => setRunning(false)} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 8, border: "none", background: T.red, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Stop</button>
              </>
            ) : (
              <button onClick={() => setRunning(true)} style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>▶ Start live tracking</button>
            )}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plate number…"
            style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: T.text, background: T.bg, outline: "none" }} />
        </div>
        {VehicleList}
      </div>

      {/* Map */}
      <div ref={mapRef} style={{ flex: 1, position: "relative" }} />
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

function Screen({ icon, title, sub, loading }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui,sans-serif", background: "linear-gradient(135deg,#f0fdf4 0%,#dcfce7 50%,#bbf7d0 100%)" }}>
      <style>{`
        @keyframes ht-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.96)} }
        @keyframes ht-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes ht-fade-up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ht-ring { 0%,100%{box-shadow:0 0 0 0 rgba(22,163,74,0.4)} 50%{box-shadow:0 0 0 18px rgba(22,163,74,0)} }
      `}</style>
      <div style={{ textAlign: "center", padding: 32, maxWidth: 400, animation: "ht-fade-up 0.5s ease both" }}>
        <div style={{ position: "relative", display: "inline-block", marginBottom: 24 }}>
          <img src="/logo.svg" alt="Helion Tracking" style={{ width: 90, height: 90, borderRadius: "50%", background: "#fff", padding: 12, boxShadow: "0 4px 24px rgba(22,163,74,0.25)", animation: loading ? "ht-pulse 1.8s ease infinite" : "ht-ring 2.5s ease-in-out 0.3s both" }} />
          {loading && (
            <div style={{ position: "absolute", inset: -6, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "#16a34a", borderRightColor: "#16a34a", animation: "ht-spin 1s linear infinite" }} />
          )}
        </div>
        <div style={{ fontWeight: 800, fontSize: 13, color: "#16a34a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Helion Tracking</div>
        <div style={{ fontWeight: 800, fontSize: 20, color: "#111827", marginBottom: 8, animation: "ht-fade-up 0.5s 0.15s ease both", opacity: 0 }}>{title}</div>
        {sub && <div style={{ fontSize: 14, color: "#6b7280", animation: "ht-fade-up 0.5s 0.3s ease both", opacity: 0 }}>{sub}</div>}
        {!loading && <div style={{ marginTop: 20, fontSize: 13, color: "#9ca3af", animation: "ht-fade-up 0.5s 0.45s ease both", opacity: 0 }}>heliontracking.com</div>}
      </div>
    </div>
  );
}

function LeafletLoader() {
  useEffect(() => {
    if (window.L) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    document.head.appendChild(script);
  }, []);
  return null;
}
