import { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "./theme.jsx";

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(path, {
    ...opts,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function fetchDispatch() {
  const json = await apiFetch('/api/dispatch/live-map');
  return { data: json.data || [], isAdmin: !!json.isAdmin };
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
  const isAdmin = user?.role === 'admin' || user?.can_view_tracking;

  // Map state
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

  // Admin user management state
  const [sideTab, setSideTab] = useState("map"); // "map" | "users"
  const [dispatchUsers, setDispatchUsers] = useState([]);
  const [managedUser, setManagedUser] = useState(null);
  const [userVehicles, setUserVehicles] = useState(new Set());
  const [userSaving, setUserSaving] = useState(false);
  const [userSaveMsg, setUserSaveMsg] = useState(null);
  const [pwModal, setPwModal] = useState(null);
  const [pwValue, setPwValue] = useState("");
  const [pwMsg, setPwMsg] = useState(null);
  const [pwSaving, setPwSaving] = useState(false);

  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef({});
  const pollRef = useRef(null);
  const mapInitRef = useRef(false);
  const searchRef = useRef(null);

  useEffect(() => {
    fetchDispatch()
      .then(({ data }) => {
        const vehicles = data || [];
        setAllVehicles(vehicles);
        const groups = new Set(vehicles.map(v => v.group || "Ungrouped"));
        setExpandedGroups(groups);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch('/api/dispatch/users').then(j => setDispatchUsers(j.data || [])).catch(() => {});
  }, [isAdmin]);

  // Autocomplete suggestions
  useEffect(() => {
    if (!search.trim()) { setSuggestions([]); return; }
    const q = search.toLowerCase();
    const matches = allVehicles.filter(v => v.plate?.toLowerCase().includes(q)).slice(0, 8);
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
      const gpsOk = v.gpsValid && v.gpsLocked !== false;
      const unconfirmed = online && !gpsOk;
      const ago = agoLabel(v.gpsTime);
      const statusLine = !gpsOk
        ? (unconfirmed ? "Online — GPS not locked" : "GPS Invalid")
        : online
        ? `Online${v.speed != null ? " · " + v.speed.toFixed(0) + " km/h" : ""}`
        : `Offline${ago ? " · " + ago : ""}`;

      let labelHtml;
      if (unconfirmed) {
        labelHtml = `<div style="background:#fff3cd;color:#7c5a00;font-size:13px;font-weight:800;font-family:system-ui,sans-serif;padding:5px 11px;border-radius:12px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.35);border:2px dashed #f5a623;line-height:1.4;">${v.plate} <span style="font-size:10px;font-weight:600;color:#c17900">GPS?</span></div>`;
      } else if (!gpsOk) {
        labelHtml = `<div style="background:#f5f5f5;color:#666;font-size:13px;font-weight:700;font-family:system-ui,sans-serif;padding:5px 10px;border-radius:12px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.25);border:2px solid #bbb;line-height:1.4;">${v.plate} <span style="font-size:10px;color:#999">No GPS</span></div>`;
      } else {
        const borderColor = online ? "#1e7e50" : "#c26000";
        const txtColor = online ? "#1a6640" : "#9a4800";
        labelHtml = `<div style="background:#fff;color:${txtColor};font-size:13px;font-weight:800;font-family:system-ui,sans-serif;padding:5px 11px;border-radius:12px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.3);border:3px solid ${borderColor};line-height:1.4;">${v.plate}</div>`;
      }

      const color = unconfirmed ? "#f5a623" : !gpsOk ? "#9e9e9e" : online ? "#3daf7a" : "#f57c00";
      const icon = L.divIcon({ className: "", html: labelHtml, iconAnchor: [0, 0] });

      const satInfo = v.satellites != null ? ` · ${v.satellites} sat` : "";
      const warningLine = unconfirmed ? `<br/><span style="background:#fff3cd;color:#7c5a00;font-size:11px;padding:2px 6px;border-radius:4px;font-weight:600;">GPS not locked — position may be inaccurate${satInfo}</span>` : "";
      const movingStatus = gpsOk ? (v.speed != null && v.speed > 1 ? "Driving" : "Parked") : null;
      const movingLine = movingStatus ? `<br/><span style="font-size:11px;color:#444">Status: <b>${movingStatus}</b></span>` : "";
      const locId = `loc-${id}`;
      const popup = `<div style="font-family:system-ui,sans-serif;font-size:13px;min-width:180px"><b style="font-size:14px">${v.plate}</b><br/><span style="color:${color};font-weight:600">${statusLine}</span>${warningLine}${movingLine}<br/><span id="${locId}" style="color:#444;font-size:12px">Loading location...</span>${v.gpsTime ? `<br/><span style="color:#999;font-size:11px">Last GPS: ${new Date(v.gpsTime).toLocaleTimeString()}</span>` : ""}</div>`;

      const fillLocation = (lat, lng, elemId) => {
        apiFetch(`/api/dispatch/geocode?lat=${lat}&lng=${lng}`)
          .then(d => { const el = document.getElementById(elemId); if (el) el.textContent = d.name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`; })
          .catch(() => { const el = document.getElementById(elemId); if (el) el.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; });
      };

      if (markersRef.current[id]) {
        markersRef.current[id].setLatLng([v.lat, v.lng]).setIcon(icon).setPopupContent(popup);
      } else {
        const marker = L.marker([v.lat, v.lng], { icon }).addTo(map).bindPopup(popup);
        marker.on('popupopen', () => fillLocation(v.lat, v.lng, locId));
        markersRef.current[id] = marker;
      }
      if (markersRef.current[id].isPopupOpen()) fillLocation(v.lat, v.lng, locId);
      bounds.push([v.lat, v.lng]);
    }

    if (isFirst && bounds.length > 0) {
      if (bounds.length === 1) map.setView(bounds[0], 14);
      else map.fitBounds(window.L.latLngBounds(bounds), { padding: [40, 40] });
    }
  }, []);

  const fetchAndUpdate = useCallback(async () => {
    if (selected.size === 0) return;
    try {
      const { data } = await fetchDispatch();
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
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
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

  function selectAll() { setSelected(new Set(filteredVehicles.map(v => v.devIdno))); }

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
    setExpandedGroups(prev => new Set([...prev, v.group || "Ungrouped"]));
  }

  function selectManagedUser(u) {
    setManagedUser(u);
    setUserVehicles(new Set((u.dispatch_vehicles || []).map(String)));
    setUserSaveMsg(null);
  }

  function toggleUserVehicle(devIdno) {
    setUserVehicles(prev => {
      const next = new Set(prev);
      next.has(devIdno) ? next.delete(devIdno) : next.add(devIdno);
      return next;
    });
  }

  async function saveUserVehicles() {
    if (!managedUser) return;
    setUserSaving(true);
    setUserSaveMsg(null);
    try {
      await apiFetch(`/api/dispatch/users/${managedUser.id}/vehicles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: [...userVehicles] }),
      });
      setDispatchUsers(prev => prev.map(u => u.id === managedUser.id ? { ...u, dispatch_vehicles: [...userVehicles] } : u));
      setUserSaveMsg({ ok: true, text: "Saved" });
    } catch (e) {
      setUserSaveMsg({ ok: false, text: e.message });
    } finally {
      setUserSaving(false);
    }
  }

  async function resetPassword() {
    if (!pwModal || !pwValue) return;
    setPwSaving(true);
    setPwMsg(null);
    try {
      await apiFetch(`/api/dispatch/users/${pwModal.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwValue }),
      });
      setPwMsg({ ok: true, text: "Password updated" });
      setPwValue("");
    } catch (e) {
      setPwMsg({ ok: false, text: e.message });
    } finally {
      setPwSaving(false);
    }
  }

  const q = search.toLowerCase();
  const filteredVehicles = q ? allVehicles.filter(v => v.plate?.toLowerCase().includes(q)) : allVehicles;
  const groups = groupVehicles(filteredVehicles);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", fontFamily: "system-ui,sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: 284, minWidth: 240, background: t.panel, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header + tabs */}
        <div style={{ padding: "14px 14px 0", borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: t.text, marginBottom: 10 }}>Dispatch View</div>
          {isAdmin && (
            <div style={{ display: "flex", gap: 0, marginBottom: 0 }}>
              {["map", "users"].map(tab => (
                <button key={tab} onClick={() => setSideTab(tab)} style={{
                  flex: 1, padding: "6px 0", border: "none", background: "none", cursor: "pointer",
                  fontWeight: 700, fontSize: 12, color: sideTab === tab ? t.accent : t.muted,
                  borderBottom: `2px solid ${sideTab === tab ? t.accent : "transparent"}`,
                  textTransform: "capitalize",
                }}>{tab === "map" ? "Map" : "Manage Users"}</button>
              ))}
            </div>
          )}
        </div>

        {sideTab === "map" ? (
          <>
            {/* Search */}
            <div style={{ padding: "10px 14px 0", borderBottom: `1px solid ${t.border}` }}>
              <div style={{ position: "relative" }} ref={searchRef}>
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Search plate number..."
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${t.border}`, borderRadius: 8, padding: "7px 28px 7px 10px", fontSize: 12, color: t.text, background: t.bg, outline: "none" }}
                />
                {search && (
                  <button onMouseDown={e => { e.preventDefault(); setSearch(""); setSuggestions([]); }} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: t.muted, fontSize: 16, lineHeight: 1 }}>×</button>
                )}
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: t.panel, border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.12)", zIndex: 100, overflow: "hidden" }}>
                    {suggestions.map(v => (
                      <div key={v.devIdno} onMouseDown={() => pickSuggestion(v)}
                        style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, color: t.text, borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                        onMouseEnter={e => e.currentTarget.style.background = t.accentSoft}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ fontWeight: 700 }}>{v.plate}</span>
                        <span style={{ fontSize: 10, color: t.textSoft }}>{v.group || ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
                <button onClick={selectAll} style={btnStyle(t, t.textSoft)}>Select all</button>
                <button onClick={clearAll} style={btnStyle(t, t.red)}>Clear all</button>
              </div>
            </div>

            {/* Controls */}
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${t.border}`, display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => { if (selected.size > 0) setRunning(true); }} disabled={running || selected.size === 0} style={btnStyle(t, t.accent, running || selected.size === 0)}>Start</button>
              <button onClick={() => setRunning(false)} disabled={!running} style={btnStyle(t, t.red, !running)}>Stop</button>
              {running && <span style={{ fontSize: 11, color: t.accent, fontWeight: 700 }}>Live</span>}
              <span style={{ marginLeft: "auto", fontSize: 11, color: t.textSoft }}>{selected.size} selected</span>
            </div>

            {/* Vehicle list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && <div style={{ padding: 16, color: t.textSoft, fontSize: 12 }}>Loading vehicles...</div>}
              {error && <div style={{ padding: 16, color: t.red, fontSize: 12 }}>{error}</div>}
              {groups.map(([groupName, vehicles]) => {
                const expanded = expandedGroups.has(groupName);
                const allIn = vehicles.every(v => selected.has(v.devIdno));
                const someIn = vehicles.some(v => selected.has(v.devIdno));
                return (
                  <div key={groupName}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer", background: t.panelBright, borderBottom: `1px solid ${t.border}`, position: "sticky", top: 0, zIndex: 1 }}>
                      <div onClick={() => toggleGroup(groupName, vehicles)} style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, border: `2px solid ${allIn ? t.accent : someIn ? t.accent : t.border}`, background: allIn ? t.accent : someIn ? t.accentSoft : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                        {allIn && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
                        {!allIn && someIn && <span style={{ color: t.accent, fontSize: 10, lineHeight: 1 }}>–</span>}
                      </div>
                      <div onClick={() => setExpandedGroups(prev => { const next = new Set(prev); next.has(groupName) ? next.delete(groupName) : next.add(groupName); return next; })} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: t.muted, transition: "transform 0.15s", display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                        <span style={{ fontWeight: 700, fontSize: 11, color: t.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>{groupName}</span>
                        <span style={{ fontSize: 10, color: t.muted, marginLeft: "auto" }}>{vehicles.length}</span>
                      </div>
                    </div>
                    {expanded && vehicles.map(v => {
                      const st = statuses[v.devIdno];
                      const isSelected = selected.has(v.devIdno);
                      const online = st?.online;
                      const ago = agoLabel(st?.gpsTime);
                      const gpsOkSt = st?.gpsValid && st?.gpsLocked !== false;
                      const unconfirmedSt = st?.online && !gpsOkSt;
                      const dotColor = !st ? t.border : unconfirmedSt ? "#f5a623" : !gpsOkSt ? t.muted : online ? t.green : t.orange;
                      return (
                        <div key={v.devIdno}
                          onClick={() => toggleSelect(v.devIdno)}
                          onDoubleClick={() => {
                            const cur = statuses[v.devIdno] || v;
                            if (cur?.lat != null && cur?.lng != null && leafletRef.current) {
                              leafletRef.current.flyTo([cur.lat, cur.lng], 16, { duration: 1 });
                              markersRef.current[v.devIdno]?.openPopup();
                            }
                          }}
                          title="Double-click to zoom to vehicle"
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px 7px 36px", cursor: "pointer", background: isSelected ? t.accentSoft : "transparent", borderLeft: `3px solid ${isSelected ? t.accent : "transparent"}`, borderBottom: `1px solid ${t.border}` }}>
                          <div style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, border: `2px solid ${isSelected ? t.accent : t.border}`, background: isSelected ? t.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {isSelected && <span style={{ color: "#fff", fontSize: 9, lineHeight: 1 }}>✓</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 12, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.plate}</div>
                            {st && (
                              <div style={{ fontSize: 10, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} />
                                {unconfirmedSt ? <span style={{ color: "#c17900", fontWeight: 700 }}>GPS not locked</span>
                                  : !gpsOkSt ? <span style={{ color: t.muted }}>GPS invalid</span>
                                  : online ? <span style={{ color: t.green }}>Online{st.speed != null ? ` · ${st.speed.toFixed(0)} km/h` : ""}</span>
                                  : <span style={{ color: t.orange }}>Offline{ago ? ` · ${ago}` : ""}</span>}
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
          </>
        ) : (
          /* Users tab — admin only */
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* User list */}
            <div style={{ borderBottom: `1px solid ${t.border}`, overflowY: "auto", maxHeight: 180 }}>
              {dispatchUsers.length === 0 && <div style={{ padding: 14, color: t.muted, fontSize: 12 }}>No dispatch users yet. Create users with "Access Dispatch View" permission.</div>}
              {dispatchUsers.map(u => (
                <div key={u.id} onClick={() => selectManagedUser(u)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", cursor: "pointer", background: managedUser?.id === u.id ? t.accentSoft : "transparent", borderBottom: `1px solid ${t.border}`, borderLeft: `3px solid ${managedUser?.id === u.id ? t.accent : "transparent"}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: t.text }}>{u.name}</div>
                    <div style={{ fontSize: 10, color: t.muted }}>{u.email} · {(u.dispatch_vehicles || []).length} vehicles</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setPwModal(u); setPwValue(""); setPwMsg(null); }}
                    style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, border: `1px solid ${t.border}`, background: "none", color: t.muted, cursor: "pointer" }}>
                    Reset PW
                  </button>
                </div>
              ))}
            </div>

            {/* Vehicle assignment for selected user */}
            {managedUser ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.text }}>Assign to {managedUser.name}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {userSaveMsg && <span style={{ fontSize: 11, color: userSaveMsg.ok ? t.green : t.red }}>{userSaveMsg.text}</span>}
                    <button onClick={saveUserVehicles} disabled={userSaving} style={btnStyle(t, t.accent, userSaving)}>
                      {userSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {groupVehicles(allVehicles).map(([groupName, vehicles]) => (
                    <div key={groupName}>
                      <div style={{ padding: "6px 14px", background: t.panelBright, borderBottom: `1px solid ${t.border}`, fontSize: 10, fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>{groupName}</span>
                        <button onClick={() => {
                          const allIn = vehicles.every(v => userVehicles.has(v.devIdno));
                          setUserVehicles(prev => {
                            const next = new Set(prev);
                            if (allIn) vehicles.forEach(v => next.delete(v.devIdno));
                            else vehicles.forEach(v => next.add(v.devIdno));
                            return next;
                          });
                        }} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, border: `1px solid ${t.border}`, background: "none", color: t.muted, cursor: "pointer" }}>
                          {vehicles.every(v => userVehicles.has(v.devIdno)) ? "Remove all" : "Add all"}
                        </button>
                      </div>
                      {vehicles.map(v => {
                        const assigned = userVehicles.has(v.devIdno);
                        return (
                          <div key={v.devIdno} onClick={() => toggleUserVehicle(v.devIdno)}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px 6px 24px", cursor: "pointer", background: assigned ? t.accentSoft : "transparent", borderBottom: `1px solid ${t.border}` }}>
                            <div style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, border: `2px solid ${assigned ? t.accent : t.border}`, background: assigned ? t.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {assigned && <span style={{ color: "#fff", fontSize: 9, lineHeight: 1 }}>✓</span>}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{v.plate}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: 16, color: t.muted, fontSize: 12, textAlign: "center", marginTop: 20 }}>Select a user to assign vehicles</div>
            )}
          </div>
        )}
      </div>

      {/* Map area */}
      <div style={{ flex: 1, position: "relative", background: "#e8eaed" }}>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
        <LeafletLoader />
        {!running && selected.size === 0 && sideTab === "map" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, pointerEvents: "none" }}>
            <div style={{ background: "rgba(255,255,255,0.92)", borderRadius: 16, padding: "24px 36px", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>Select vehicles, then press Start</div>
              <div style={{ fontSize: 12, color: t.textSoft, marginTop: 6 }}>Live locations update every 8 seconds</div>
            </div>
          </div>
        )}
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      </div>

      {/* Password reset modal */}
      {pwModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: t.panel, borderRadius: 16, padding: 28, minWidth: 320, boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: t.text, marginBottom: 4 }}>Reset Password</div>
            <div style={{ fontSize: 12, color: t.muted, marginBottom: 16 }}>{pwModal.name} ({pwModal.email})</div>
            <input
              type="password"
              value={pwValue}
              onChange={e => setPwValue(e.target.value)}
              placeholder="New password (min 6 chars)"
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${t.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: t.text, background: t.bg, outline: "none", marginBottom: 10 }}
            />
            {pwMsg && <div style={{ fontSize: 12, color: pwMsg.ok ? t.green : t.red, marginBottom: 10 }}>{pwMsg.text}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={resetPassword} disabled={pwSaving || !pwValue} style={btnStyle(t, t.accent, pwSaving || !pwValue)}>
                {pwSaving ? "Saving..." : "Set Password"}
              </button>
              <button onClick={() => { setPwModal(null); setPwMsg(null); setPwValue(""); }} style={btnStyle(t, t.muted)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
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
