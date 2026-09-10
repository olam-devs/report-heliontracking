import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "./theme.jsx";

async function fetchDispatch() {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/dispatch/live-map', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

const POLL_MS = 8000;

function agoLabel(ts) {
  if (!ts) return null;
  const ms = Date.now() - new Date(ts).getTime();
  if (isNaN(ms) || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}M ago`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h}H ${rm}M ago` : `${h}H ago`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}D ${rh}H ago` : `${d}D ago`;
}

function groupVehicles(vehicles) {
  const groups = {};
  for (const v of vehicles) {
    const g = v.group || "Ungrouped";
    if (!groups[g]) groups[g] = [];
    groups[g].push(v);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

export default function LiveMap({ user }) {
  const { t } = useTheme();
  const [allVehicles, setAllVehicles] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [statuses, setStatuses] = useState({});
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef({});
  const pollRef = useRef(null);
  const mapInitRef = useRef(false);
  const searchRef = useRef(null);

  useEffect(() => {
    fetchDispatch()
      .then(data => {
        const vehicles = data || [];
        setAllVehicles(vehicles);
        // Expand all groups by default
        const groups = new Set(vehicles.map(v => v.group || "Ungrouped"));
        setExpandedGroups(groups);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Autocomplete suggestions
  useEffect(() => {
    if (!search.trim()) { setSuggestions([]); return; }
    const q = search.toLowerCase();
    const matches = allVehicles
      .filter(v => v.plate?.toLowerCase().includes(q))
      .slice(0, 8);
    setSuggestions(matches);
  }, [search, allVehicles]);

  // Init Leaflet map
  useEffect(() => {
    if (mapInitRef.current || !mapRef.current || !window.L) return;
    const L = window.L;
    const map = L.map(mapRef.current, { center: [-6.8, 39.28], zoom: 11 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    leafletRef.current = map;
    mapInitRef.current = true;
  });

  const updateMarkers = useCallback((byId, currentSelected) => {
    const L = window.L;
    if (!L || !leafletRef.current) return;
    const map = leafletRef.current;

    for (const id of Object.keys(markersRef.current)) {
      if (!currentSelected.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    }

    const isFirst = Object.keys(markersRef.current).length === 0;
    const bounds = [];

    for (const id of currentSelected) {
      const v = byId[id];
      if (!v || v.lat == null || v.lng == null) continue;

      const online = !!v.online;
      const online = v.online;
      const gpsOk = v.gpsValid && v.gpsLocked !== false;
      const unconfirmed = online && !gpsOk; // online but no GPS lock
      const ago = agoLabel(v.gpsTime);
      const statusLine = !gpsOk
        ? (unconfirmed ? "Online — GPS not locked" : "GPS Invalid")
        : online
        ? `Online${v.speed != null ? " · " + v.speed.toFixed(0) + " km/h" : ""}`
        : `Offline${ago ? " · " + ago : ""}`;

      let labelHtml;
      if (unconfirmed) {
        // Online but GPS not yet locked — amber warning with striped border
        labelHtml = `<div style="background:#fff3cd;color:#7c5a00;font-size:13px;font-weight:800;font-family:system-ui,sans-serif;padding:5px 11px;border-radius:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px dashed #f5a623;line-height:1.4;">${v.plate}<span style="font-size:10px;font-weight:600;margin-left:6px;color:#c17900">⚠ GPS?</span></div>`;
      } else if (!gpsOk) {
        // Completely invalid GPS
        labelHtml = `<div style="background:#e0e0e0;color:#555;font-size:13px;font-weight:700;font-family:system-ui,sans-serif;padding:5px 10px;border-radius:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #9e9e9e;line-height:1.4;opacity:0.8;">${v.plate}<span style="font-size:10px;font-weight:500;margin-left:5px;color:#888">No GPS</span></div>`;
      } else {
        const color = online ? "#3daf7a" : "#f57c00";
        labelHtml = `<div style="background:${color};color:#fff;font-size:13px;font-weight:800;font-family:system-ui,sans-serif;padding:5px 11px;border-radius:12px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2px solid rgba(255,255,255,0.7);line-height:1.4;">${v.plate}</div>`;
      }

      const color = unconfirmed ? "#f5a623" : !gpsOk ? "#9e9e9e" : online ? "#3daf7a" : "#f57c00";
      const icon = L.divIcon({
        className: "",
        html: labelHtml,
        iconAnchor: [0, 0],
      });

      const satInfo = v.satellites != null ? ` · ${v.satellites} sat` : "";
      const warningLine = unconfirmed ? `<br/><span style="background:#fff3cd;color:#7c5a00;font-size:11px;padding:2px 6px;border-radius:4px;font-weight:600;">⚠ GPS not locked — position may be inaccurate${satInfo}</span>` : "";
      const popup = `<div style="font-family:system-ui,sans-serif;font-size:13px;min-width:160px"><b style="font-size:14px">${v.plate}</b><br/><span style="color:${color};font-weight:600">${statusLine}</span>${warningLine}<br/><span style="color:#666;font-size:11px">${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}</span>${v.gpsTime ? `<br/><span style="color:#666;font-size:11px">GPS: ${new Date(v.gpsTime).toLocaleTimeString()}</span>` : ""}</div>`;

      if (markersRef.current[id]) {
        markersRef.current[id].setLatLng([v.lat, v.lng]).setIcon(icon).setPopupContent(popup);
      } else {
        markersRef.current[id] = L.marker([v.lat, v.lng], { icon }).addTo(map).bindPopup(popup);
      }
      bounds.push([v.lat, v.lng]);
    }

    if (isFirst && bounds.length > 0) {
      const L2 = window.L;
      if (bounds.length === 1) map.setView(bounds[0], 14);
      else map.fitBounds(L2.latLngBounds(bounds), { padding: [40, 40] });
    }
  }, []);

  const fetchAndUpdate = useCallback(async () => {
    if (selected.size === 0) return;
    try {
      const data = await fetchDispatch();
      const byId = {};
      for (const v of data) byId[v.devIdno] = v;
      setStatuses(byId);
      updateMarkers(byId, selected);
    } catch {}
  }, [selected, updateMarkers]);

  useEffect(() => {
    if (running && selected.size > 0) {
      fetchAndUpdate();
      pollRef.current = setInterval(fetchAndUpdate, POLL_MS);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [running, selected, fetchAndUpdate]);

  useEffect(() => {
    if (!leafletRef.current) return;
    for (const id of Object.keys(markersRef.current)) {
      if (!selected.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    }
  }, [selected]);

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroup(groupName, vehicles) {
    const allIn = vehicles.every(v => selected.has(v.devIdno));
    setSelected(prev => {
      const next = new Set(prev);
      if (allIn) vehicles.forEach(v => next.delete(v.devIdno));
      else vehicles.forEach(v => next.add(v.devIdno));
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filteredVehicles.map(v => v.devIdno)));
  }

  function clearAll() {
    setSelected(new Set());
    setRunning(false);
    for (const m of Object.values(markersRef.current)) m.remove();
    markersRef.current = {};
    setStatuses({});
  }

  function pickSuggestion(v) {
    setSearch(v.plate);
    setSuggestions([]);
    setShowSuggestions(false);
    // Expand group containing this vehicle
    const g = v.group || "Ungrouped";
    setExpandedGroups(prev => new Set([...prev, g]));
  }

  const q = search.toLowerCase();
  const filteredVehicles = q
    ? allVehicles.filter(v => v.plate?.toLowerCase().includes(q))
    : allVehicles;

  const groups = groupVehicles(filteredVehicles);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", fontFamily: "system-ui,sans-serif" }}>
      {/* Sidebar */}
      <div style={{
        width: 284,
        minWidth: 240,
        background: t.panel,
        borderRight: `1px solid ${t.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: t.text, marginBottom: 8 }}>
            Dispatch View
          </div>

          {/* Search with autocomplete */}
          <div style={{ position: "relative" }} ref={searchRef}>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search plate number..."
              style={{
                width: "100%", boxSizing: "border-box",
                border: `1px solid ${t.border}`, borderRadius: 8,
                padding: "7px 28px 7px 10px", fontSize: 12,
                color: t.text, background: t.bg, outline: "none",
              }}
            />
            {search && (
              <button
                onMouseDown={e => { e.preventDefault(); setSearch(""); setSuggestions([]); }}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: t.muted, fontSize: 16, lineHeight: 1 }}
              >×</button>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                background: t.panel, border: `1px solid ${t.border}`, borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden",
              }}>
                {suggestions.map(v => (
                  <div
                    key={v.devIdno}
                    onMouseDown={() => pickSuggestion(v)}
                    style={{
                      padding: "8px 12px", cursor: "pointer", fontSize: 12,
                      color: t.text, borderBottom: `1px solid ${t.border}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = t.accentSoft}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ fontWeight: 700 }}>{v.plate}</span>
                    <span style={{ fontSize: 10, color: t.textSoft }}>{v.group || ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={selectAll} style={btnStyle(t, t.textSoft)}>Select all</button>
            <button onClick={clearAll} style={btnStyle(t, t.red)}>Clear all</button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${t.border}`, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => { if (selected.size > 0) setRunning(true); }}
            disabled={running || selected.size === 0}
            style={btnStyle(t, t.accent, running || selected.size === 0)}
          >
            Start
          </button>
          <button
            onClick={() => setRunning(false)}
            disabled={!running}
            style={btnStyle(t, t.red, !running)}
          >
            Stop
          </button>
          {running && (
            <span style={{ fontSize: 11, color: t.accent, fontWeight: 700 }}>Live</span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: t.textSoft }}>{selected.size} selected</span>
        </div>

        {/* Vehicle groups */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: 16, color: t.textSoft, fontSize: 12 }}>Loading vehicles...</div>}
          {error && <div style={{ padding: 16, color: t.red, fontSize: 12 }}>{error}</div>}

          {groups.map(([groupName, vehicles]) => {
            const expanded = expandedGroups.has(groupName);
            const allIn = vehicles.every(v => selected.has(v.devIdno));
            const someIn = vehicles.some(v => selected.has(v.devIdno));

            return (
              <div key={groupName}>
                {/* Group header */}
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px", cursor: "pointer",
                    background: t.panelBright, borderBottom: `1px solid ${t.border}`,
                    position: "sticky", top: 0, zIndex: 1,
                  }}
                >
                  {/* Group checkbox */}
                  <div
                    onClick={() => toggleGroup(groupName, vehicles)}
                    style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: `2px solid ${allIn ? t.accent : someIn ? t.accent : t.border}`,
                      background: allIn ? t.accent : someIn ? t.accentSoft : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    }}
                  >
                    {allIn && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
                    {!allIn && someIn && <span style={{ color: t.accent, fontSize: 10, lineHeight: 1 }}>–</span>}
                  </div>

                  {/* Expand toggle */}
                  <div
                    onClick={() => setExpandedGroups(prev => {
                      const next = new Set(prev);
                      next.has(groupName) ? next.delete(groupName) : next.add(groupName);
                      return next;
                    })}
                    style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span style={{ fontSize: 10, color: t.muted, transition: "transform 0.15s", display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span style={{ fontWeight: 700, fontSize: 11, color: t.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>{groupName}</span>
                    <span style={{ fontSize: 10, color: t.muted, marginLeft: "auto" }}>{vehicles.length}</span>
                  </div>
                </div>

                {/* Vehicle rows */}
                {expanded && vehicles.map(v => {
                  const st = statuses[v.devIdno];
                  const isSelected = selected.has(v.devIdno);
                  const online = st?.online;
                  const ago = agoLabel(st?.gpsTime);
                  const gpsOkSt = st?.gpsValid && st?.gpsLocked !== false;
                  const unconfirmedSt = st?.online && !gpsOkSt;
                  const dotColor = !st ? t.border : unconfirmedSt ? "#f5a623" : !gpsOkSt ? t.muted : online ? t.green : t.orange;

                  return (
                    <div
                      key={v.devIdno}
                      onClick={() => toggleSelect(v.devIdno)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 14px 7px 36px", cursor: "pointer",
                        background: isSelected ? t.accentSoft : "transparent",
                        borderLeft: `3px solid ${isSelected ? t.accent : "transparent"}`,
                        borderBottom: `1px solid ${t.border}`,
                      }}
                    >
                      <div style={{
                        width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                        border: `2px solid ${isSelected ? t.accent : t.border}`,
                        background: isSelected ? t.accent : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isSelected && <span style={{ color: "#fff", fontSize: 9, lineHeight: 1 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {v.plate}
                        </div>
                        {st && (
                          <div style={{ fontSize: 10, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} />
                            {unconfirmedSt
                              ? <span style={{ color: "#c17900", fontWeight: 700 }}>Online — GPS not locked</span>
                              : !gpsOkSt
                              ? <span style={{ color: t.muted }}>GPS invalid</span>
                              : online
                              ? <span style={{ color: t.green }}>Online{st.speed != null ? ` · ${st.speed.toFixed(0)} km/h` : ""}</span>
                              : <span style={{ color: t.orange }}>Offline{ago ? ` · ${ago}` : ""}</span>
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Map area */}
      <div style={{ flex: 1, position: "relative", background: "#e8eaed" }}>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
        <LeafletLoader />

        {!running && selected.size === 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", zIndex: 10, pointerEvents: "none",
          }}>
            <div style={{
              background: "rgba(255,255,255,0.92)", borderRadius: 16, padding: "24px 36px",
              textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>Select vehicles, then press Start</div>
              <div style={{ fontSize: 12, color: t.textSoft, marginTop: 6 }}>Live locations update every 8 seconds</div>
            </div>
          </div>
        )}

        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
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

function btnStyle(t, color, disabled = false) {
  return {
    flex: 1, padding: "6px 0", borderRadius: 7, border: "none",
    background: disabled ? t.border : color,
    color: disabled ? t.textSoft : "#fff",
    fontWeight: 700, fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
