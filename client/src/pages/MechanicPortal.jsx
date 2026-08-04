import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';

const fmtTs = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtDate = (s) => {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const isImage = (mime) => mime?.startsWith('image/');

// ── Status pill ──────────────────────────────────────────────────────────────
function StatusRow({ status }) {
  if (!status) return <div className="text-xs text-gray-400 italic">Status unavailable</div>;
  const online = (status.ol ?? status.online ?? 0) !== 0;
  const acc = status.accOn;
  const fuel = status.fuel;
  const lat = status.lat;
  const lng = status.lng;
  const hasLocation = lat != null && lng != null && (lat !== 0 || lng !== 0);
  const mapsUrl = hasLocation ? `https://maps.google.com/?q=${lat},${lng}` : null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className={`px-2 py-1 rounded-full font-semibold ${online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
        {online ? '● Online' : '○ Offline'}
      </span>
      <span className={`px-2 py-1 rounded-full font-semibold ${acc ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
        ACC {acc ? 'ON' : 'OFF'}
      </span>
      {fuel != null && (
        <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">⛽ {Math.round(fuel)}L</span>
      )}
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noreferrer"
          className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center gap-1">
          📍 View location
        </a>
      )}
    </div>
  );
}

// ── Single log card ──────────────────────────────────────────────────────────
function LogCard({ log, isToday }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {isToday && <span className="text-[10px] font-bold bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full uppercase tracking-wide">Today</span>}
          <span className="text-xs text-gray-400">{fmtTs(log.recorded_at)}</span>
          {log.mechanic_name && <span className="text-xs text-gray-500">by {log.mechanic_name}</span>}
        </div>
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{log.note}</p>
        {log.attachments?.length > 0 && (
          <button onClick={() => setOpen(o => !o)}
            className="mt-2 text-xs text-brand-600 font-medium flex items-center gap-1">
            📎 {log.attachments.length} file{log.attachments.length !== 1 ? 's' : ''} {open ? '▲' : '▼'}
          </button>
        )}
      </div>
      {open && log.attachments?.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 grid grid-cols-3 gap-2">
          {log.attachments.map(a => (
            <a key={a.id} href={`/uploads/mechanic/${log.id}/${a.filename}`} target="_blank" rel="noreferrer"
              className="flex flex-col items-center gap-1">
              {isImage(a.mime_type) ? (
                <img src={`/uploads/mechanic/${log.id}/${a.filename}`} alt={a.original_name}
                  className="w-full aspect-square object-cover rounded-xl border border-gray-200" />
              ) : (
                <div className="w-full aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-3xl">📄</div>
              )}
              <span className="text-[10px] text-gray-500 text-center w-full truncate">{a.original_name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Admin note in timeline ───────────────────────────────────────────────────
function NoteTimelineCard({ note, isNew, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(note.note);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!editText.trim()) return;
    setSaving(true);
    try {
      await api.put(`/mechanic/admin/notes/${note.id}`, { note: editText.trim() });
      onEdit?.(note.id, editText.trim());
      setEditing(false);
    } catch { } finally { setSaving(false); }
  };

  return (
    <div className={`rounded-2xl border-2 p-4 ${isNew ? 'border-amber-400 bg-amber-50' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wide text-amber-700">📋 Supervisor Note</span>
        {isNew && <span className="text-[10px] font-bold bg-amber-400 text-white px-2 py-0.5 rounded-full uppercase">New</span>}
        <span className="text-xs text-amber-600">{fmtTs(note.created_at)}</span>
        {(onEdit || onDelete) && !editing && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => { setEditText(note.note); setEditing(true); }}
              className="text-xs text-amber-700 font-semibold hover:underline">Edit</button>
            <button onClick={() => onDelete?.(note.id)}
              className="text-xs text-red-400 font-semibold hover:underline">Delete</button>
          </div>
        )}
      </div>
      {note.created_by_name && <p className="text-xs text-amber-700 mb-2">by {note.created_by_name}</p>}
      {editing ? (
        <div className="space-y-2">
          <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
            className="input w-full resize-none text-sm" style={{ fontSize: '16px' }} />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !editText.trim()}
              className="btn btn-primary text-xs py-1.5 px-4 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-500 px-3">Cancel</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-amber-900 whitespace-pre-wrap break-words leading-relaxed">{note.note}</p>
      )}
    </div>
  );
}

// ── Merge mechanic logs + admin notes into one sorted timeline ────────────────
function mergeTimeline(logs, notes) {
  const items = [
    ...logs.map(l => ({ ...l, _type: 'log',  _ts: l.log_date || l.recorded_at })),
    ...notes.map(n => ({ ...n, _type: 'note', _ts: n.created_at })),
  ];
  items.sort((a, b) => String(b._ts).localeCompare(String(a._ts)));
  return items;
}

// ── Add log form ─────────────────────────────────────────────────────────────
function AddLogForm({ devIdno, plate, onAdded }) {
  const [note, setNote] = useState('');
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const submit = async () => {
    if (!note.trim()) return toast.error('Write a note first');
    setSaving(true);
    try {
      const { data } = await api.post('/mechanic/logs', { devIdno, plate, note });
      const log = data.data;
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        await api.post(`/mechanic/logs/${log.id}/attachments`, fd);
      }
      toast.success('Log saved');
      setNote('');
      setFiles([]);
      onAdded();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Add work log — {plate}</h3>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
        placeholder="Describe the work done on this vehicle…"
        className="input w-full resize-none text-base leading-relaxed" style={{ fontSize: '16px' }} />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-gray-100 rounded-lg px-2 py-1.5">
              {f.type.startsWith('image/') ? '🖼' : '📄'} <span className="max-w-[120px] truncate">{f.name}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="flex-1 border-2 border-dashed border-gray-300 text-gray-500 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 active:bg-gray-50">
          📎 {files.length ? `${files.length} file${files.length > 1 ? 's' : ''}` : 'Attach photos'}
        </button>
        {files.length > 0 && (
          <button onClick={() => setFiles([])} className="px-3 text-red-400 text-sm border border-red-200 rounded-xl">✕</button>
        )}
        <input ref={fileRef} type="file" multiple className="hidden" onChange={e => setFiles(Array.from(e.target.files))} />
        <button onClick={submit} disabled={saving || !note.trim()}
          className="flex-1 btn btn-primary py-2.5 text-sm font-bold rounded-xl disabled:opacity-40">
          {saving ? 'Saving…' : '✓ Save log'}
        </button>
      </div>
    </div>
  );
}

// ── Searchable vehicle picker ─────────────────────────────────────────────────
function VehicleSearch({ vehicles, value, onChange, placeholder = 'Search vehicle plate…' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef();

  const selected = vehicles.find(v => v.devIdno === value);
  const filtered = query
    ? vehicles.filter(v => v.plate?.toLowerCase().includes(query.toLowerCase()))
    : vehicles;

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const select = (v) => { onChange(v.devIdno); setQuery(''); setOpen(false); };
  const clear = () => { onChange(''); setQuery(''); };

  return (
    <div className="relative" ref={ref}>
      <div className="input flex items-center gap-2 cursor-pointer" onClick={() => setOpen(o => !o)}>
        {selected ? (
          <>
            <span className="flex-1 text-sm font-medium">{selected.plate}</span>
            <button type="button" onClick={e => { e.stopPropagation(); clear(); }} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
          </>
        ) : (
          <span className="flex-1 text-sm text-gray-400">{placeholder}</span>
        )}
        <span className="text-gray-400 text-xs">▼</span>
      </div>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus className="input text-sm py-1.5 w-full" placeholder="Type to filter…"
              value={query} onChange={e => setQuery(e.target.value)} onClick={e => e.stopPropagation()} />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-gray-400 text-center">No vehicles found</div>
            ) : filtered.map(v => (
              <button key={v.devIdno} type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 hover:text-brand-700 transition-colors ${v.devIdno === value ? 'bg-brand-50 text-brand-700 font-semibold' : ''}`}
                onClick={() => select(v)}>
                {v.plate}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mechanic portal (sidebar layout) ─────────────────────────────────────────
function MechanicView() {
  const [page, setPage] = useState('work');

  // Shared data
  const [fleetVehicles, setFleetVehicles]   = useState([]);
  const [workedVehicles, setWorkedVehicles] = useState([]);
  const [pendingVehicles, setPendingVehicles] = useState([]);

  // Log Work page
  const [workVehicle, setWorkVehicle] = useState('');
  const [workStatus, setWorkStatus]   = useState(null);
  const [workLogs, setWorkLogs]       = useState([]);
  const [workLogsLoading, setWorkLogsLoading] = useState(false);

  // History page
  const [histVehicle, setHistVehicle]   = useState(null);
  const [histLogs, setHistLogs]         = useState([]);
  const [histNotes, setHistNotes]       = useState([]);
  const [histLoading, setHistLoading]   = useState(false);
  const [histSearch, setHistSearch]     = useState('');
  const [histDateFrom, setHistDateFrom] = useState('');
  const [histDateTo, setHistDateTo]     = useState('');

  // Notifications page
  const [allNotes, setAllNotes]     = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const today = todayStr();

  const refreshWorkedVehicles = () =>
    api.get('/mechanic/my-worked-vehicles').then(r => setWorkedVehicles(r.data.data || [])).catch(() => {});

  const refreshPending = () =>
    api.get('/mechanic/pending').then(r => setPendingVehicles(r.data.data || [])).catch(() => {});

  useEffect(() => {
    api.get('/mechanic/all-vehicles').then(r => setFleetVehicles(r.data.data || [])).catch(() => {});
    refreshWorkedVehicles();
    refreshPending();
  }, []);

  // Status polling for selected work vehicle
  useEffect(() => {
    if (!workVehicle) { setWorkStatus(null); setWorkLogs([]); return; }
    api.get(`/mechanic/vehicle-status/${workVehicle}`).then(r => setWorkStatus(r.data.data)).catch(() => {});
    loadWorkLogs(workVehicle);
    const iv = setInterval(() => {
      api.get(`/mechanic/vehicle-status/${workVehicle}`).then(r => setWorkStatus(r.data.data)).catch(() => {});
    }, 8000);
    return () => clearInterval(iv);
  }, [workVehicle]);

  const loadWorkLogs = async (devIdno) => {
    if (!devIdno) return;
    setWorkLogsLoading(true);
    try {
      const r = await api.get('/mechanic/my-logs', { params: { devIdno, date: today } });
      setWorkLogs(r.data.data || []);
    } catch {} finally { setWorkLogsLoading(false); }
  };

  // Load history when vehicle selected
  useEffect(() => {
    if (!histVehicle) { setHistLogs([]); setHistNotes([]); return; }
    setHistLoading(true);
    Promise.all([
      api.get('/mechanic/my-logs', { params: { devIdno: histVehicle } }),
      api.get(`/mechanic/admin-notes/${histVehicle}`),
    ]).then(([lr, nr]) => {
      setHistLogs(lr.data.data || []);
      setHistNotes(nr.data.data || []);
      const v = workedVehicles.find(v => v.devIdno === histVehicle);
      if (Number(v?.unread_notes) > 0)
        api.post(`/mechanic/mark-notes-read/${histVehicle}`).then(refreshWorkedVehicles).catch(() => {});
    }).catch(() => {}).finally(() => setHistLoading(false));
  }, [histVehicle]);

  // Load notifications page data
  useEffect(() => {
    if (page !== 'notifications') return;
    setNotesLoading(true);
    api.get('/mechanic/my-all-notes')
      .then(r => setAllNotes(r.data.data || []))
      .catch(() => {})
      .finally(() => setNotesLoading(false));
  }, [page]);

  const totalUnread = workedVehicles.reduce((s, v) => s + Number(v.unread_notes || 0), 0);
  const pendingCount = pendingVehicles.length;

  const workVehicleInfo    = fleetVehicles.find(v => String(v.devIdno) === String(workVehicle))
                          || workedVehicles.find(v => String(v.devIdno) === String(workVehicle));
  const workVehiclePending = pendingVehicles.find(p => String(p.devIdno) === String(workVehicle));

  const vehicleList = fleetVehicles.length ? fleetVehicles : workedVehicles;

  const navItems = [
    { id: 'work',          emoji: '🔧', label: 'Log Work'  },
    { id: 'history',       emoji: '📋', label: 'History'   },
    { id: 'notifications', emoji: '🔔', label: 'Notes',    badge: totalUnread },
    { id: 'pending',       emoji: '⚠️',  label: 'Pending',  badge: pendingCount },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-52 bg-white border-r border-gray-200 fixed top-[52px] bottom-0 left-0 z-20 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Mechanic Portal</p>
        </div>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)}
            className={`flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors ${
              page === n.id
                ? 'bg-brand-50 text-brand-700 border-r-2 border-brand-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}>
            <span className="text-base">{n.emoji}</span>
            <span>{n.label}</span>
            {n.badge > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {n.badge > 99 ? '99+' : n.badge}
              </span>
            )}
          </button>
        ))}
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50">
        {navItems.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
              page === n.id ? 'text-brand-600' : 'text-gray-400'
            }`}>
            <span className="relative text-xl leading-none">
              {n.emoji}
              {n.badge > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                  {n.badge > 9 ? '9+' : n.badge}
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium">{n.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Main content ── */}
      <div className="md:ml-52 pb-20 md:pb-6">

        {/* ══ Log Work ══ */}
        {page === 'work' && (
          <div className="p-4 space-y-4 max-w-lg mx-auto">
            <h2 className="text-base font-bold text-gray-800 pt-1">Log Work</h2>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Select vehicle</p>
              <VehicleSearch
                vehicles={vehicleList}
                value={workVehicle}
                onChange={setWorkVehicle}
                placeholder={vehicleList.length ? 'Search vehicle plate…' : 'Loading vehicles…'}
              />
            </div>

            {workVehicle && (
              <>
                {workVehiclePending && (
                  <div className="bg-orange-50 border-2 border-orange-400 rounded-2xl px-4 py-3 flex items-start gap-3">
                    <span className="text-xl mt-0.5">⚠️</span>
                    <div>
                      <p className="text-sm font-bold text-orange-800">This vehicle is marked pending</p>
                      {workVehiclePending.reason && (
                        <p className="text-xs text-orange-700 mt-0.5">{workVehiclePending.reason}</p>
                      )}
                      <p className="text-xs text-orange-600 mt-0.5">
                        Flagged by {workVehiclePending.marked_by_name || 'supervisor'} — needs fast attention
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                    Live status — {workVehicleInfo?.plate || workVehicle}
                  </p>
                  <StatusRow status={workStatus} />
                </div>

                <AddLogForm
                  devIdno={workVehicle}
                  plate={workVehicleInfo?.plate || workVehicle}
                  onAdded={() => { loadWorkLogs(workVehicle); refreshWorkedVehicles(); }}
                />

                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 px-1">
                    Today's logs — {workVehicleInfo?.plate || workVehicle}
                  </p>
                  {workLogsLoading ? (
                    <div className="text-sm text-gray-400 py-6 text-center">Loading…</div>
                  ) : workLogs.length === 0 ? (
                    <div className="bg-white rounded-2xl p-6 text-center text-sm text-gray-400 shadow-sm">
                      No logs today for this vehicle.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {workLogs.map(l => <LogCard key={l.id} log={l} isToday />)}
                    </div>
                  )}
                </div>
              </>
            )}

            {!workVehicle && vehicleList.length === 0 && (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <div className="text-5xl mb-3">🚗</div>
                <p className="font-semibold text-gray-700">Loading vehicles…</p>
                <p className="text-sm text-gray-400 mt-1">Fleet vehicles will appear in the picker above.</p>
              </div>
            )}
          </div>
        )}

        {/* ══ History ══ */}
        {page === 'history' && (
          <div className="p-4 space-y-4 max-w-lg mx-auto">
            <h2 className="text-base font-bold text-gray-800 pt-1">Vehicle History</h2>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-brand-600 px-4 py-3">
                <span className="text-white text-sm font-bold">🔍 Search Vehicle History</span>
              </div>
              <div className="p-4 space-y-3">
                <input type="text" value={histSearch}
                  onChange={e => { setHistSearch(e.target.value); setHistVehicle(null); }}
                  placeholder="Type vehicle plate number…"
                  className="input w-full text-base font-medium" style={{ fontSize: '16px' }} />

                {histSearch && !histVehicle && (() => {
                  const matches = workedVehicles.filter(v =>
                    v.plate?.toLowerCase().includes(histSearch.toLowerCase())
                  );
                  if (!matches.length) return (
                    <p className="text-xs text-gray-400 text-center py-1">No matching vehicles in your history</p>
                  );
                  return (
                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      {matches.map(v => (
                        <button key={v.devIdno}
                          onClick={() => { setHistVehicle(v.devIdno); setHistSearch(v.plate); }}
                          className="w-full text-left px-4 py-3 hover:bg-brand-50 flex items-center justify-between border-b border-gray-100 last:border-0">
                          <span className="font-semibold text-gray-800">{v.plate}</span>
                          <div className="flex items-center gap-2">
                            {pendingVehicles.find(p => p.devIdno === v.devIdno) && (
                              <span className="text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">⚠️ Pending</span>
                            )}
                            {Number(v.unread_notes) > 0 && (
                              <span className="bg-amber-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                                {v.unread_notes} new
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">From date</label>
                    <input type="date" className="input text-sm" value={histDateFrom}
                      onChange={e => setHistDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">To date</label>
                    <input type="date" className="input text-sm" value={histDateTo}
                      min={histDateFrom || ''} onChange={e => setHistDateTo(e.target.value)} />
                  </div>
                </div>
                {(histDateFrom || histDateTo) && (
                  <button onClick={() => { setHistDateFrom(''); setHistDateTo(''); }}
                    className="text-xs text-red-400 font-medium">✕ Clear date filter</button>
                )}
              </div>
            </div>

            {histVehicle && (() => {
              if (histLoading) return <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>;
              let timeline = mergeTimeline(histLogs, histNotes);
              if (histDateFrom) timeline = timeline.filter(i => String(i._ts).slice(0,10) >= histDateFrom);
              if (histDateTo)   timeline = timeline.filter(i => String(i._ts).slice(0,10) <= histDateTo);
              const plate = workedVehicles.find(v => v.devIdno === histVehicle)?.plate || histVehicle;
              const isPending = !!pendingVehicles.find(p => p.devIdno === histVehicle);
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <p className="text-xs text-gray-400 font-medium">
                      {timeline.length} item{timeline.length !== 1 ? 's' : ''} — {plate}
                    </p>
                    {isPending && (
                      <span className="text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">⚠️ Pending</span>
                    )}
                  </div>
                  {timeline.length === 0 ? (
                    <div className="bg-white rounded-2xl p-6 text-center text-sm text-gray-400 shadow-sm">
                      No records in this range.
                    </div>
                  ) : timeline.map(item =>
                    item._type === 'note' ? (
                      <NoteTimelineCard key={`n-${item.id}`} note={item} isNew={false} />
                    ) : (
                      <LogCard key={`l-${item.id}`} log={item} isToday={String(item.log_date).slice(0,10) === today} />
                    )
                  )}
                </div>
              );
            })()}

            {!histVehicle && !histSearch && workedVehicles.length === 0 && (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <div className="text-4xl mb-3">📋</div>
                <p className="font-semibold text-gray-700">No history yet</p>
                <p className="text-sm text-gray-400 mt-1">Your work logs will appear here.</p>
              </div>
            )}
          </div>
        )}

        {/* ══ Notifications ══ */}
        {page === 'notifications' && (
          <div className="p-4 space-y-4 max-w-lg mx-auto">
            <div className="flex items-center justify-between pt-1">
              <h2 className="text-base font-bold text-gray-800">Supervisor Notes</h2>
              {totalUnread > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">
                  {totalUnread} unread
                </span>
              )}
            </div>

            {notesLoading ? (
              <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
            ) : allNotes.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <div className="text-4xl mb-3">📋</div>
                <p className="font-semibold text-gray-700">No supervisor notes yet</p>
                <p className="text-sm text-gray-400 mt-1">Notes from your supervisor will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allNotes.map(n => {
                  const veh = workedVehicles.find(v => v.devIdno === n.devIdno || v.plate === n.plate);
                  const isUnread = Number(veh?.unread_notes) > 0;
                  return (
                    <div key={n.id}
                      className={`rounded-2xl border-2 p-4 ${isUnread ? 'border-amber-400 bg-amber-50' : 'border-amber-200 bg-amber-50/60'}`}>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-bold bg-white text-gray-700 border border-gray-200 px-2 py-0.5 rounded-full">
                          {n.plate || n.devIdno}
                        </span>
                        {isUnread && (
                          <span className="text-[10px] font-bold bg-amber-400 text-white px-2 py-0.5 rounded-full uppercase">New</span>
                        )}
                        <span className="text-xs text-amber-600 ml-auto">{fmtTs(n.created_at)}</span>
                      </div>
                      {n.created_by_name && <p className="text-xs text-amber-700 mb-1">by {n.created_by_name}</p>}
                      <p className="text-sm text-amber-900 whitespace-pre-wrap break-words leading-relaxed">{n.note}</p>
                      <button
                        onClick={() => { setHistVehicle(n.devIdno); setHistSearch(n.plate || n.devIdno); setPage('history'); }}
                        className="mt-2 text-xs text-brand-600 font-semibold hover:underline">
                        View vehicle history →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ Pending ══ */}
        {page === 'pending' && (
          <div className="p-4 space-y-4 max-w-lg mx-auto">
            <h2 className="text-base font-bold text-gray-800 pt-1">Pending Vehicles</h2>
            <p className="text-xs text-gray-500">Vehicles flagged by your supervisor that need fast attention.</p>

            {pendingVehicles.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <div className="text-4xl mb-3">✅</div>
                <p className="font-semibold text-gray-700">No pending vehicles</p>
                <p className="text-sm text-gray-400 mt-1">When a vehicle is flagged, it will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingVehicles.map(p => (
                  <div key={p.id} className="bg-white rounded-2xl border-2 border-orange-300 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl mt-0.5">⚠️</span>
                        <div>
                          <p className="font-bold text-gray-900 text-base">{p.plate || p.devIdno}</p>
                          {p.reason && <p className="text-sm text-orange-700 mt-0.5">{p.reason}</p>}
                          <p className="text-xs text-gray-400 mt-1">
                            Flagged {p.marked_by_name ? `by ${p.marked_by_name}` : ''} · {fmtTs(p.marked_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => { setHistVehicle(p.devIdno); setHistSearch(p.plate || p.devIdno); setPage('history'); }}
                          className="btn btn-primary text-xs py-2 px-4">
                          View history
                        </button>
                        <button
                          onClick={() => { setWorkVehicle(p.devIdno); setPage('work'); }}
                          className="btn text-xs py-2 px-4 bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200">
                          Log work
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Admin mechanic panel ──────────────────────────────────────────────────────
function AdminView() {
  const [tab, setTab] = useState('logs');
  const [mechanics, setMechanics]   = useState([]);
  const [vehicles, setVehicles]     = useState([]);
  const [pendingVehicles, setPendingVehicles] = useState([]);
  const [logs, setLogs]             = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError]   = useState('');
  const [adminNotes, setAdminNotes] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedAdminLog, setSelectedAdminLog] = useState(null);

  // Logs filters
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo]     = useState('');
  const [logMechanic, setLogMechanic] = useState('');
  const [logVehicle, setLogVehicle]   = useState('');

  // Vehicle history
  const [histVehicle, setHistVehicle]   = useState('');
  const [histMechanic, setHistMechanic] = useState('');
  const [histLogs, setHistLogs]         = useState([]);
  const [histNotes, setHistNotes]       = useState([]);
  const [histLoading, setHistLoading]   = useState(false);
  const [histSearched, setHistSearched] = useState(false);

  // Pending form state (shown inline in Vehicle History)
  const [showPendingForm, setShowPendingForm] = useState(false);
  const [pendingReason, setPendingReason]     = useState('');
  const [savingPending, setSavingPending]     = useState(false);

  // Admin note form
  const [noteVehicle, setNoteVehicle] = useState('');
  const [noteText, setNoteText]       = useState('');
  const [savingNote, setSavingNote]   = useState(false);

  const refreshUnreadCount = () =>
    api.get('/mechanic/admin/unread-count').then(r => setUnreadCount(r.data.data?.count || 0)).catch(() => {});

  const refreshPending = () =>
    api.get('/mechanic/pending').then(r => setPendingVehicles(r.data.data || [])).catch(() => {});

  useEffect(() => {
    api.get('/mechanic/admin/mechanics').then(r => setMechanics(r.data.data || [])).catch(() => {});
    api.get('/tracking/vehicles').then(r => setVehicles(r.data.data || [])).catch(() => {});
    api.get('/mechanic/admin/notes').then(r => setAdminNotes(r.data.data || [])).catch(() => {});
    refreshUnreadCount();
    refreshPending();
  }, []);

  const loadLogs = async () => {
    setLogsLoading(true);
    setLogsError('');
    try {
      const params = {};
      if (logDateFrom) params.date_from = logDateFrom;
      if (logDateTo)   params.date_to   = logDateTo;
      if (logMechanic) params.mechanic_user_id = logMechanic;
      if (logVehicle) {
        const v = vehicles.find(x => x.devIdno === logVehicle);
        params.devIdno = logVehicle;
        if (v?.plate) params.plate = v.plate;
      }
      const r = await api.get('/mechanic/admin/logs', { params });
      const fetched = r.data.data || [];
      setLogs(fetched);
      const unreadIds = fetched.filter(l => !l.seen_by_admin).map(l => l.id);
      if (unreadIds.length)
        api.post('/mechanic/admin/mark-logs-read', { ids: unreadIds }).then(refreshUnreadCount).catch(() => {});
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Failed to load logs';
      setLogsError(msg);
      toast.error(msg);
    } finally { setLogsLoading(false); }
  };

  useEffect(() => {
    if (tab === 'logs') loadLogs();
  }, [tab, logDateFrom, logDateTo, logMechanic, logVehicle]);

  const loadHistory = async () => {
    if (!histVehicle) return toast.error('Select a vehicle first');
    setHistLoading(true);
    setHistSearched(true);
    setShowPendingForm(false);
    try {
      const v = vehicles.find(x => x.devIdno === histVehicle);
      const params = { devIdno: histVehicle };
      if (v?.plate) params.plate = v.plate;
      if (histMechanic) params.mechanic_user_id = histMechanic;
      const [logsRes, notesRes] = await Promise.all([
        api.get('/mechanic/admin/vehicle-history', { params }),
        api.get(`/mechanic/admin-notes/${histVehicle}`).catch(() => ({ data: { data: [] } })),
      ]);
      setHistLogs(logsRes.data.data || []);
      setHistNotes(notesRes.data.data || []);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to load history'); }
    finally { setHistLoading(false); }
  };

  const addNote = async () => {
    if (!noteVehicle || !noteText.trim()) return toast.error('Select vehicle and write a note');
    setSavingNote(true);
    const v = vehicles.find(x => x.devIdno === noteVehicle);
    try {
      await api.post('/mechanic/admin/notes', { devIdno: noteVehicle, plate: v?.plate || noteVehicle, note: noteText.trim() });
      toast.success('Note saved');
      setNoteText('');
      if (histVehicle === noteVehicle && histSearched) loadHistory();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } finally { setSavingNote(false); }
  };

  const deleteNote = async (id) => {
    await api.delete(`/mechanic/admin/notes/${id}`).catch(() => {});
    setAdminNotes(prev => prev.filter(n => n.id !== id));
    setHistNotes(prev => prev.filter(n => n.id !== id));
  };

  const editNote = (id, newText) => {
    const patch = n => n.id === id ? { ...n, note: newText } : n;
    setAdminNotes(prev => prev.map(patch));
    setHistNotes(prev => prev.map(patch));
  };

  const handleMarkPending = async () => {
    if (!histVehicle) return;
    setSavingPending(true);
    const v = vehicles.find(x => x.devIdno === histVehicle);
    try {
      await api.post('/mechanic/admin/pending', { devIdno: histVehicle, plate: v?.plate || histVehicle, reason: pendingReason.trim() || null });
      toast.success('Vehicle marked as pending');
      setPendingReason('');
      setShowPendingForm(false);
      refreshPending();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } finally { setSavingPending(false); }
  };

  const handleUnmarkPending = async (devIdno) => {
    try {
      await api.delete(`/mechanic/admin/pending/${devIdno}`);
      toast.success('Removed from pending');
      refreshPending();
    } catch (e) { toast.error('Failed'); }
  };

  const Tab = ({ id, label, badge }) => (
    <button onClick={() => setTab(id)}
      className={`relative px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
      {label}
      {badge > 0 && (
        <span className="ml-1.5 inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Mechanic Management</h1>

      <div className="flex border-b border-gray-200 gap-1 flex-wrap">
        <Tab id="logs"    label="Work Logs"      badge={unreadCount} />
        <Tab id="history" label="Vehicle History" />
      </div>

      {/* ── Work Logs tab ── */}
      {tab === 'logs' && (
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">From date</label>
                <input type="date" className="input" value={logDateFrom}
                  onChange={e => {
                    setLogDateFrom(e.target.value);
                    if (e.target.value && logDateTo) {
                      const max = new Date(new Date(e.target.value).getTime() + 6 * 86400000).toISOString().slice(0,10);
                      if (logDateTo > max) setLogDateTo(max);
                      if (logDateTo < e.target.value) setLogDateTo(e.target.value);
                    }
                  }} />
              </div>
              <div>
                <label className="label">To date <span className="text-gray-400 font-normal">(max 7 days)</span></label>
                <input type="date" className="input" value={logDateTo}
                  min={logDateFrom || ''}
                  max={logDateFrom ? new Date(new Date(logDateFrom).getTime() + 6 * 86400000).toISOString().slice(0,10) : ''}
                  onChange={e => setLogDateTo(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Mechanic</label>
                <select className="input" value={logMechanic} onChange={e => setLogMechanic(e.target.value)}>
                  <option value="">All mechanics</option>
                  {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Vehicle</label>
                <VehicleSearch vehicles={vehicles} value={logVehicle} onChange={setLogVehicle} placeholder="All vehicles…" />
              </div>
            </div>
            <button onClick={loadLogs} className="btn btn-primary w-full">🔍 Search Logs</button>
          </div>

          {logsLoading ? (
            <div className="card p-10 text-center text-gray-400">Loading…</div>
          ) : logsError ? (
            <div className="card p-6 text-center text-red-500 text-sm">{logsError}</div>
          ) : logs.length === 0 ? (
            <div className="card p-10 text-center text-gray-400">No work logs found for this date range.</div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium px-1">{logs.length} log{logs.length !== 1 ? 's' : ''} — click any to view full details</p>
              {logs.map(l => {
                const isPending = !!pendingVehicles.find(p => p.devIdno === l.devIdno || p.plate === l.plate);
                return (
                  <div key={l.id} onClick={() => setSelectedAdminLog(l)}
                    className="card p-4 cursor-pointer hover:border-brand-200 hover:shadow-md transition-all border border-transparent">
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      <span className="font-bold text-sm text-gray-900">{l.plate}</span>
                      {isPending && (
                        <span className="text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">⚠️ Pending</span>
                      )}
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">📅 {l.log_date}</span>
                      <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">🔧 {l.mechanic_name}</span>
                      {l.attachments?.length > 0 && <span className="text-xs text-gray-400">📎 {l.attachments.length}</span>}
                      <span className="ml-auto text-xs text-gray-300">view →</span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 leading-snug">{l.note}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Log detail modal */}
          {selectedAdminLog && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
              onClick={e => { if (e.target === e.currentTarget) setSelectedAdminLog(null); }}>
              <div className="bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold text-gray-900">{selectedAdminLog.plate}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">📅 {selectedAdminLog.log_date}</span>
                    <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">🔧 {selectedAdminLog.mechanic_name}</span>
                  </div>
                  <button onClick={() => setSelectedAdminLog(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
                </div>
                <div className="overflow-y-auto p-5 space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Work note</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">{selectedAdminLog.note}</p>
                  </div>
                  <p className="text-xs text-gray-400">Recorded: {fmtTs(selectedAdminLog.recorded_at)}</p>
                  {selectedAdminLog.attachments?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Attachments ({selectedAdminLog.attachments.length})</p>
                      <div className="grid grid-cols-3 gap-3">
                        {selectedAdminLog.attachments.map(a => (
                          <a key={a.id} href={`/uploads/mechanic/${selectedAdminLog.id}/${a.filename}`} target="_blank" rel="noreferrer"
                            className="group flex flex-col items-center gap-1.5">
                            {isImage(a.mime_type) ? (
                              <img src={`/uploads/mechanic/${selectedAdminLog.id}/${a.filename}`} alt={a.original_name}
                                className="w-full aspect-square object-cover rounded-xl border border-gray-200 group-hover:opacity-80" />
                            ) : (
                              <div className="w-full aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-3xl">📄</div>
                            )}
                            <span className="text-[10px] text-gray-500 text-center w-full truncate">{a.original_name}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Vehicle History tab ── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {/* Add note form */}
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-700">Add supervisor note for a vehicle</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="label">Vehicle</label>
                <VehicleSearch vehicles={vehicles} value={noteVehicle} onChange={setNoteVehicle} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Note</label>
                <div className="flex gap-2">
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={1}
                    placeholder="Write a note for the mechanic on this vehicle…"
                    className="input flex-1 resize-none text-sm" />
                  <button onClick={addNote} disabled={savingNote} className="btn btn-primary shrink-0 self-end">
                    {savingNote ? 'Saving…' : 'Add note'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Search history */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-700">Search full history for a vehicle</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="label">Vehicle</label>
                <VehicleSearch vehicles={vehicles} value={histVehicle} onChange={v => { setHistVehicle(v); setHistSearched(false); }} />
              </div>
              <div>
                <label className="label">Filter by mechanic (optional)</label>
                <select className="input" value={histMechanic} onChange={e => setHistMechanic(e.target.value)}>
                  <option value="">All mechanics</option>
                  {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <button onClick={loadHistory} disabled={histLoading || !histVehicle} className="btn btn-primary w-full">
                  {histLoading ? 'Loading…' : 'Search history'}
                </button>
              </div>
            </div>
          </div>

          {histSearched && !histLoading && (() => {
            const timeline = mergeTimeline(histLogs, histNotes);
            const plate = vehicles.find(v => v.devIdno === histVehicle)?.plate || histVehicle;
            const isPending = !!pendingVehicles.find(p => p.devIdno === histVehicle);

            return (
              <div className="space-y-4">
                {/* Pending status bar */}
                <div className={`card p-4 flex items-center justify-between gap-4 flex-wrap ${isPending ? 'border-orange-300 bg-orange-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    {isPending ? (
                      <>
                        <span className="text-xl">⚠️</span>
                        <div>
                          <p className="font-semibold text-orange-800 text-sm">This vehicle is marked pending</p>
                          {pendingVehicles.find(p => p.devIdno === histVehicle)?.reason && (
                            <p className="text-xs text-orange-700 mt-0.5">{pendingVehicles.find(p => p.devIdno === histVehicle).reason}</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">{plate}</span> — {timeline.length} item{timeline.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isPending ? (
                      <button onClick={() => handleUnmarkPending(histVehicle)}
                        className="btn text-xs py-1.5 px-3 bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200">
                        ✓ Remove Pending
                      </button>
                    ) : (
                      <button onClick={() => setShowPendingForm(f => !f)}
                        className="btn text-xs py-1.5 px-3 bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100">
                        ⚠️ Mark as Pending
                      </button>
                    )}
                  </div>
                </div>

                {showPendingForm && !isPending && (
                  <div className="card p-4 border-orange-200 bg-orange-50 space-y-3">
                    <p className="text-sm font-semibold text-orange-800">Mark vehicle as pending</p>
                    <textarea value={pendingReason} onChange={e => setPendingReason(e.target.value)}
                      placeholder="Reason (optional) — what needs to be done?"
                      rows={2} className="input w-full resize-none text-sm" />
                    <div className="flex gap-2">
                      <button onClick={handleMarkPending} disabled={savingPending}
                        className="btn btn-primary text-xs py-2 px-4 disabled:opacity-40">
                        {savingPending ? 'Saving…' : '⚠️ Confirm pending'}
                      </button>
                      <button onClick={() => { setShowPendingForm(false); setPendingReason(''); }}
                        className="text-xs text-gray-500 px-3">Cancel</button>
                    </div>
                  </div>
                )}

                {timeline.length === 0 ? (
                  <div className="card p-10 text-center text-gray-400">No history found for {plate}.</div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500 font-medium">
                      {histLogs.length} log{histLogs.length !== 1 ? 's' : ''}, {histNotes.length} note{histNotes.length !== 1 ? 's' : ''} — {plate}
                    </p>
                    {timeline.map(item => item._type === 'note' ? (
                      <NoteTimelineCard key={`n-${item.id}`} note={item} isNew={false} onEdit={editNote} onDelete={deleteNote} />
                    ) : (
                      <div key={`l-${item.id}`} className="card p-4">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
                            {fmtDate(item.log_date)}
                          </span>
                          <span className="text-xs text-gray-400">{fmtTs(item.recorded_at)}</span>
                          <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">🔧 {item.mechanic_name}</span>
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{item.note}</p>
                        {item.attachments?.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs text-gray-400 mb-2">📎 {item.attachments.length} attachment{item.attachments.length !== 1 ? 's' : ''}</p>
                            <div className="flex flex-wrap gap-2">
                              {item.attachments.map(a => (
                                <a key={a.id} href={`/uploads/mechanic/${item.id}/${a.filename}`} target="_blank" rel="noreferrer"
                                  className="group flex flex-col items-center gap-1">
                                  {isImage(a.mime_type) ? (
                                    <img src={`/uploads/mechanic/${item.id}/${a.filename}`} alt={a.original_name}
                                      className="w-20 h-20 object-cover rounded-lg border border-gray-200 group-hover:opacity-80 transition-opacity" />
                                  ) : (
                                    <div className="w-20 h-20 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-2xl">📄</div>
                                  )}
                                  <span className="text-[10px] text-gray-500 max-w-[80px] truncate">{a.original_name}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function MechanicPortal() {
  const { user } = useAuth();
  const isAdmin    = user?.role === 'admin';
  const isMechanic = user?.role === 'mechanic';

  if (!isAdmin && !isMechanic) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center"><div className="text-4xl mb-3">🔒</div><p>Access denied</p></div>
      </div>
    );
  }

  if (isAdmin) return <AdminView />;
  return <MechanicView />;
}
