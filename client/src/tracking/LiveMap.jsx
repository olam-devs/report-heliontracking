import { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "./api.js";
import { useTheme } from "./theme.jsx";

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

export default function LiveMap({ user }) {
  const { t } = useTheme();
  const [allVehicles, setAllVehicles] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [statuses, setStatuses] = useState({});
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef({});
  const pollRef = useRef(null);
  const mapInitRef = useRef(false);

  // Load initial vehicle list from live-map (no separate /vehicles call needed)
  useEffect(() => {
    apiFetch("/live-map")
      .then(data => {
        setAllVehicles(data || []);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // Init Leaflet map
  useEffect(() => {
    if (mapInitRef.current) return;
    if (!mapRef.current) return;
    if (!window.L) return;

    const L = window.L;
    const map = L.map(mapRef.current, { center: [-6.8, 39.28], zoom: 11 });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    leafletRef.current = map;
    mapInitRef.current = true;
  });

  const fetchAndUpdate = useCallback(async () => {
    if (selected.size === 0) return;
    try {
      const data = await apiFetch("/live-map");
      const byId = {};
      for (const v of data) byId[v.devIdno] = v;
      setStatuses(byId);
      updateMarkers(byId);
    } catch {}
  }, [selected]);

  function updateMarkers(byId) {
    const L = window.L;
    if (!L || !leafletRef.current) return;
    const map = leafletRef.current;

    // Remove markers for deselected vehicles
    for (const id of Object.keys(markersRef.current)) {
      if (!selected.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    }

    const bounds = [];
    for (const id of selected) {
      const v = byId[id];
      if (!v || !v.gpsValid || v.lat == null || v.lng == null) continue;

      const online = v.online;
      const color = !v.gpsValid ? "#9e9e9e" : online ? "#3daf7a" : "#f57c00";
      const ago = agoLabel(v.gpsTime);
      const statusLine = !v.gpsValid
        ? "GPS invalid"
        : online
        ? `Online · ${v.speed != null ? v.speed.toFixed(0) + " km/h" : "idle"}`
        : `Offline${ago ? " · " + ago : ""}`;

      const icon = L.divIcon({
        className: "",
        html: `<div style="
          background:${color};
          color:#fff;
          font-size:11px;
          font-weight:700;
          font-family:system-ui,sans-serif;
          padding:3px 7px;
          border-radius:10px;
          white-space:nowrap;
          box-shadow:0 2px 6px rgba(0,0,0,0.35);
          border:2px solid #fff;
          line-height:1.3;
        ">${v.plate}</div>`,
        iconAnchor: [0, 0],
      });

      const popup = `
        <div style="font-family:system-ui,sans-serif;font-size:13px;min-width:150px">
          <b style="font-size:14px">${v.plate}</b><br/>
          <span style="color:${color};font-weight:600">${statusLine}</span><br/>
          <span style="color:#666;font-size:11px">${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}</span><br/>
          ${v.gpsTime ? `<span style="color:#666;font-size:11px">GPS: ${new Date(v.gpsTime).toLocaleTimeString()}</span>` : ""}
        </div>`;

      if (markersRef.current[id]) {
        markersRef.current[id].setLatLng([v.lat, v.lng]).setIcon(icon).setPopupContent(popup);
      } else {
        const marker = L.marker([v.lat, v.lng], { icon }).addTo(map).bindPopup(popup);
        markersRef.current[id] = marker;
      }
      bounds.push([v.lat, v.lng]);
    }

    if (bounds.length > 0 && Object.keys(markersRef.current).length === bounds.length) {
      // Only fit bounds on first placement (when markers are new)
      const newIds = [...selected].filter(id => !Object.keys(markersRef.current).includes(id));
      if (newIds.length > 0 || bounds.length <= 1) {
        map.fitBounds(bounds.length === 1 ? L.latLng(bounds[0]).toBounds(2000) : bounds, { padding: [40, 40] });
      }
    }
  }

  // Start/stop polling
  useEffect(() => {
    if (running && selected.size > 0) {
      fetchAndUpdate();
      pollRef.current = setInterval(fetchAndUpdate, POLL_MS);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [running, selected, fetchAndUpdate]);

  // Remove markers when deselected while running
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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map(v => v.devIdno)));
  }

  function clearAll() {
    setSelected(new Set());
    setRunning(false);
    // Remove all markers
    for (const m of Object.values(markersRef.current)) m.remove();
    markersRef.current = {};
    setStatuses({});
  }

  const filtered = allVehicles.filter(v =>
    !search || v.plate?.toLowerCase().includes(search.toLowerCase())
  );

  const s = statuses;

  return (
    <div style={{ display: "flex", height: "100%", gap: 0, overflow: "hidden", fontFamily: "system-ui,sans-serif" }}>
      {/* Sidebar */}
      <div style={{
        width: 280,
        minWidth: 240,
        background: t.panel,
        borderRight: `1px solid ${t.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: t.text, marginBottom: 8 }}>
            Dispatch View
          </div>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: t.muted, pointerEvents: "none" }}>🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search plate number…"
              style={{
                width: "100%", boxSizing: "border-box", border: `1px solid ${t.border}`,
                borderRadius: 8, padding: "6px 10px 6px 28px", fontSize: 12, color: t.text,
                background: t.bg, outline: "none",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: t.muted, fontSize: 14, lineHeight: 1 }}
              >×</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={selectAll} style={btnStyle(t, "#5c6b7a")}>
              Select All
            </button>
            <button onClick={clearAll} style={btnStyle(t, t.red)}>
              Clear All
            </button>
          </div>
        </div>

        {/* Controls */}
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", gap: 8 }}>
          <button
            onClick={() => { if (selected.size > 0) setRunning(true); }}
            disabled={running || selected.size === 0}
            style={btnStyle(t, t.accent, running || selected.size === 0)}
          >
            ▶ Start
          </button>
          <button
            onClick={() => setRunning(false)}
            disabled={!running}
            style={btnStyle(t, t.red, !running)}
          >
            ⏹ Stop
          </button>
          {running && (
            <span style={{ fontSize: 11, color: t.accent, alignSelf: "center", fontWeight: 700 }}>
              ● Live
            </span>
          )}
        </div>

        {/* Selected count */}
        <div style={{ padding: "6px 16px", fontSize: 11, color: t.textSoft, borderBottom: `1px solid ${t.border}` }}>
          {selected.size} vehicle{selected.size !== 1 ? "s" : ""} selected
        </div>

        {/* Vehicle list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {loading && <div style={{ padding: 16, color: t.textSoft, fontSize: 12 }}>Loading vehicles…</div>}
          {error && <div style={{ padding: 16, color: t.red, fontSize: 12 }}>{error}</div>}
          {filtered.map(v => {
            const st = s[v.devIdno];
            const isSelected = selected.has(v.devIdno);
            const online = st?.online;
            const gpsValid = st?.gpsValid;
            const ago = agoLabel(st?.gpsTime);

            return (
              <div
                key={v.devIdno}
                onClick={() => toggleSelect(v.devIdno)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 16px",
                  cursor: "pointer",
                  background: isSelected ? t.accentSoft : "transparent",
                  borderLeft: `3px solid ${isSelected ? t.accent : "transparent"}`,
                  transition: "background 0.12s",
                }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: 3,
                  border: `2px solid ${isSelected ? t.accent : t.border}`,
                  background: isSelected ? t.accent : "transparent",
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isSelected && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {v.plate}
                  </div>
                  {st && (
                    <div style={{ fontSize: 10, marginTop: 2 }}>
                      {!gpsValid
                        ? <span style={{ color: t.muted }}>GPS invalid</span>
                        : online
                        ? <span style={{ color: t.green }}>● Online{st.speed != null ? ` · ${st.speed.toFixed(0)} km/h` : ""}</span>
                        : <span style={{ color: t.orange }}>● Offline{ago ? ` · ${ago}` : ""}</span>
                      }
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map area */}
      <div style={{ flex: 1, position: "relative", background: "#e8eaed" }}>
        {/* Leaflet CSS */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
        />
        {/* Leaflet JS loaded inline */}
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
              <div style={{ fontSize: 36, marginBottom: 8 }}>🗺️</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>Select vehicles, then press Start</div>
              <div style={{ fontSize: 12, color: t.textSoft, marginTop: 6 }}>Live locations update every 8 seconds</div>
            </div>
          </div>
        )}

        <div
          ref={mapRef}
          style={{ width: "100%", height: "100%" }}
        />
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
    flex: 1,
    padding: "6px 0",
    borderRadius: 7,
    border: "none",
    background: disabled ? t.border : color,
    color: disabled ? t.textSoft : "#fff",
    fontWeight: 700,
    fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "opacity 0.15s",
    opacity: disabled ? 0.6 : 1,
  };
}
