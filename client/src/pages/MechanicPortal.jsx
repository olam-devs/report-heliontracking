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
  const online = status.helionStatus === 'connected' || status.online;
  const acc = status.acc || status.gprsDisplay?.acc;
  const fuel = status.fuelDisplay?.litres ?? status.fuel;
  const speed = status.gprsDisplay?.speed ?? status.speed;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className={`px-2 py-0.5 rounded-full font-semibold ${online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
        {online ? '● Online' : '○ Offline'}
      </span>
      <span className={`px-2 py-0.5 rounded-full font-semibold ${acc ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
        ACC {acc ? 'ON' : 'OFF'}
      </span>
      {fuel != null && (
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
          ⛽ {Math.round(fuel)}L
        </span>
      )}
      {speed != null && (
        <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">
          {Math.round(speed)} km/h
        </span>
      )}
    </div>
  );
}

// ── Single log card ──────────────────────────────────────────────────────────
function LogCard({ log, isToday }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {isToday && <span className="text-[10px] font-bold bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full uppercase tracking-wide">Today</span>}
            <span className="text-xs text-gray-400">{fmtTs(log.recorded_at)}</span>
            {log.mechanic_name && <span className="text-xs text-gray-500">by {log.mechanic_name}</span>}
          </div>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{log.note}</p>
        </div>
        {log.attachments?.length > 0 && (
          <button onClick={() => setOpen(o => !o)} className="shrink-0 text-xs text-brand-600 hover:underline">
            {log.attachments.length} file{log.attachments.length !== 1 ? 's' : ''} {open ? '▲' : '▼'}
          </button>
        )}
      </div>
      {open && log.attachments?.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap gap-3">
          {log.attachments.map(a => (
            <a key={a.id} href={`/uploads/mechanic/${log.id}/${a.filename}`} target="_blank" rel="noreferrer"
              className="group flex flex-col items-center gap-1">
              {isImage(a.mime_type) ? (
                <img src={`/uploads/mechanic/${log.id}/${a.filename}`} alt={a.original_name}
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200 group-hover:opacity-80 transition-opacity" />
              ) : (
                <div className="w-20 h-20 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-2xl">📄</div>
              )}
              <span className="text-[10px] text-gray-500 text-center max-w-[80px] truncate">{a.original_name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Add work log — {plate}</h3>
      <textarea
        value={note} onChange={e => setNote(e.target.value)}
        rows={3} placeholder="Describe the work done on this vehicle…"
        className="input w-full resize-none text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="text-xs border border-dashed border-gray-300 hover:border-brand-400 text-gray-500 hover:text-brand-600 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
            📎 {files.length ? `${files.length} file${files.length > 1 ? 's' : ''}` : 'Attach photos'}
          </button>
          {files.length > 0 && (
            <button onClick={() => setFiles([])} className="text-xs text-red-400 hover:text-red-600">✕ clear</button>
          )}
          <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf"
            className="hidden" onChange={e => setFiles(Array.from(e.target.files))} />
        </div>
        <button onClick={submit} disabled={saving || !note.trim()}
          className="btn btn-primary text-sm py-1.5 px-4">
          {saving ? 'Saving…' : 'Save log'}
        </button>
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-gray-100 rounded px-2 py-1">
              {f.type.startsWith('image/') ? '🖼' : '📄'} <span className="max-w-[120px] truncate">{f.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mechanic portal (mechanic's own view) ────────────────────────────────────
function MechanicView() {
  const [grants, setGrants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState(null);
  const [adminNotes, setAdminNotes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const today = todayStr();

  useEffect(() => {
    api.get('/mechanic/my-vehicles').then(r => {
      setGrants(r.data.data || []);
    }).catch(() => toast.error('Failed to load vehicles'));
  }, []);

  useEffect(() => {
    if (!selected) { setStatus(null); setAdminNotes([]); setLogs([]); return; }
    const grant = grants.find(g => g.devIdno === selected);

    if (grant?.can_see_status) {
      setLoadingStatus(true);
      api.get(`/mechanic/vehicle-status/${selected}`).then(r => setStatus(r.data.data)).catch(() => {}).finally(() => setLoadingStatus(false));
    } else {
      setStatus(null);
    }

    api.get(`/mechanic/admin-notes/${selected}`).then(r => setAdminNotes(r.data.data || [])).catch(() => {});
    loadLogs();
  }, [selected]);

  const loadLogs = async () => {
    if (!selected) return;
    setLogsLoading(true);
    try {
      const r = await api.get('/mechanic/my-logs', { params: { devIdno: selected } });
      setLogs(r.data.data || []);
    } catch {} finally { setLogsLoading(false); }
  };

  const grant = grants.find(g => g.devIdno === selected);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">My Worklog</h1>
        <p className="text-sm text-gray-500">{fmtDate(today)} — select a vehicle to log work</p>
      </div>

      {/* Vehicle selector */}
      {grants.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-4xl mb-3">🔧</div>
          <p className="font-medium text-gray-600">No vehicles assigned today</p>
          <p className="text-sm mt-1">Your supervisor will grant you access to vehicles for today.</p>
        </div>
      ) : (
        <div>
          <label className="label">Select vehicle</label>
          <div className="flex flex-wrap gap-2">
            {grants.map(g => (
              <button key={g.id} onClick={() => setSelected(selected === g.devIdno ? null : g.devIdno)}
                className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                  selected === g.devIdno
                    ? 'bg-brand-600 text-white border-brand-600 shadow'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
                }`}>
                {g.plate}
                {g.can_see_status && <span className="ml-1.5 text-[10px] opacity-70">📊</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && grant && (
        <>
          {/* Live status */}
          {grant.can_see_status && (
            <div className="card p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Live status — {grant.plate}</h3>
              {loadingStatus ? <span className="text-xs text-gray-400">Loading…</span> : <StatusRow status={status} />}
            </div>
          )}

          {/* Admin notes */}
          {adminNotes.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-700">📋 Notes from supervisor</div>
              {adminNotes.map(n => (
                <div key={n.id} className="text-sm text-amber-900">
                  <span className="font-medium">{n.created_by_name}</span>
                  <span className="text-amber-600 text-xs ml-2">{fmtTs(n.created_at)}</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{n.note}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add log */}
          <AddLogForm devIdno={selected} plate={grant.plate} onAdded={loadLogs} />

          {/* History */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              History — {grant.plate} ({logs.length} entr{logs.length === 1 ? 'y' : 'ies'})
            </h3>
            {logsLoading ? (
              <div className="text-sm text-gray-400 p-4 text-center">Loading…</div>
            ) : logs.length === 0 ? (
              <div className="text-sm text-gray-400 p-4 text-center card">No logs yet for this vehicle.</div>
            ) : (
              <div className="space-y-3">
                {logs.map(l => <LogCard key={l.id} log={l} isToday={String(l.log_date).slice(0,10) === today} />)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Admin mechanic panel ──────────────────────────────────────────────────────
function AdminView() {
  const [tab, setTab] = useState('access');
  const [mechanics, setMechanics] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [grants, setGrants] = useState([]);
  const [logs, setLogs] = useState([]);
  const [adminNotes, setAdminNotes] = useState([]);

  // Grant form
  const [grantMechanic, setGrantMechanic] = useState('');
  const [grantVehicle, setGrantVehicle] = useState('');
  const [grantStatus, setGrantStatus] = useState(false);
  const [granting, setGranting] = useState(false);

  // Logs filter
  const [logDate, setLogDate] = useState(todayStr());
  const [logMechanic, setLogMechanic] = useState('');
  const [logVehicle, setLogVehicle] = useState('');

  // Admin note form
  const [noteVehicle, setNoteVehicle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    api.get('/mechanic/admin/mechanics').then(r => setMechanics(r.data.data || [])).catch(() => {});
    api.get('/tracking/vehicles').then(r => setVehicles(r.data.data || [])).catch(() => {});
    loadGrants();
    api.get('/mechanic/admin/notes').then(r => setAdminNotes(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'logs') loadLogs();
  }, [tab, logDate, logMechanic, logVehicle]);

  const loadGrants = () => {
    api.get('/mechanic/admin/access').then(r => setGrants(r.data.data || [])).catch(() => {});
  };

  const loadLogs = async () => {
    try {
      const params = { date: logDate };
      if (logMechanic) params.mechanic_user_id = logMechanic;
      const selectedVehicle = vehicles.find(v => v.plate === logVehicle);
      if (selectedVehicle) params.devIdno = selectedVehicle.devIdno;
      const r = await api.get('/mechanic/admin/logs', { params });
      setLogs(r.data.data || []);
    } catch {}
  };

  const grant = async () => {
    if (!grantMechanic || !grantVehicle) return toast.error('Select mechanic and vehicle');
    const v = vehicles.find(x => x.devIdno === grantVehicle);
    setGranting(true);
    try {
      await api.post('/mechanic/admin/access', { mechanic_user_id: grantMechanic, devIdno: grantVehicle, plate: v?.plate || grantVehicle, can_see_status: grantStatus });
      toast.success('Access granted');
      setGrantVehicle('');
      loadGrants();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } finally { setGranting(false); }
  };

  const revoke = async (id) => {
    await api.delete(`/mechanic/admin/access/${id}`).catch(() => {});
    toast.success('Access revoked');
    loadGrants();
  };

  const addNote = async () => {
    if (!noteVehicle || !noteText.trim()) return toast.error('Select vehicle and write a note');
    setSavingNote(true);
    const v = vehicles.find(x => x.devIdno === noteVehicle);
    try {
      await api.post('/mechanic/admin/notes', { devIdno: noteVehicle, plate: v?.plate || noteVehicle, note: noteText.trim() });
      toast.success('Note saved');
      setNoteText('');
      api.get('/mechanic/admin/notes').then(r => setAdminNotes(r.data.data || []));
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } finally { setSavingNote(false); }
  };

  const deleteNote = async (id) => {
    await api.delete(`/mechanic/admin/notes/${id}`).catch(() => {});
    setAdminNotes(prev => prev.filter(n => n.id !== id));
  };

  const Tab = ({ id, label }) => (
    <button onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
      {label}
    </button>
  );

  // Group grants by mechanic for display
  const grantsByMechanic = {};
  for (const g of grants) {
    (grantsByMechanic[g.mechanic_user_id] = grantsByMechanic[g.mechanic_user_id] || { name: g.mechanic_name, grants: [] }).grants.push(g);
  }

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Mechanic Management</h1>

      <div className="flex border-b border-gray-200 gap-1">
        <Tab id="access" label="Vehicle Access" />
        <Tab id="logs"   label="Work Logs" />
        <Tab id="notes"  label="Vehicle Notes" />
      </div>

      {/* ── Access tab ── */}
      {tab === 'access' && (
        <div className="space-y-5">
          {/* Grant form */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-700">Grant vehicle access for today</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <label className="label">Mechanic</label>
                <select className="input" value={grantMechanic} onChange={e => setGrantMechanic(e.target.value)}>
                  <option value="">Select mechanic…</option>
                  {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Vehicle</label>
                <select className="input" value={grantVehicle} onChange={e => setGrantVehicle(e.target.value)}>
                  <option value="">Select vehicle…</option>
                  {vehicles.map(v => <option key={v.devIdno} value={v.devIdno}>{v.plate}</option>)}
                </select>
              </div>
              <div className="flex flex-col justify-end pb-0.5">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={grantStatus} onChange={e => setGrantStatus(e.target.checked)}
                    className="rounded border-gray-300 text-brand-600" />
                  <span>Allow status view</span>
                </label>
                <span className="text-xs text-gray-400 mt-0.5">Online, ACC, fuel, speed</span>
              </div>
              <div className="flex flex-col justify-end">
                <button onClick={grant} disabled={granting} className="btn btn-primary w-full">
                  {granting ? 'Granting…' : 'Grant access'}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400">Access expires automatically at midnight. You can revoke it at any time.</p>
          </div>

          {/* Active grants */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
              Active grants today ({grants.length})
            </div>
            {Object.keys(grantsByMechanic).length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">No active grants.</div>
            ) : Object.values(grantsByMechanic).map((m, i) => (
              <div key={i} className="px-5 py-3 border-b border-gray-50 last:border-0">
                <div className="font-medium text-sm text-gray-800 mb-2">🔧 {m.name}</div>
                <div className="flex flex-wrap gap-2">
                  {m.grants.map(g => (
                    <div key={g.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                      <span className="font-medium">{g.plate}</span>
                      {g.can_see_status && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">📊 Status</span>}
                      <span className="text-xs text-gray-400">by {g.granted_by_name}</span>
                      <button onClick={() => revoke(g.id)} className="ml-1 text-red-400 hover:text-red-600 text-xs font-bold" title="Revoke">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Logs tab ── */}
      {tab === 'logs' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={logDate} onChange={e => setLogDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Mechanic</label>
              <select className="input" value={logMechanic} onChange={e => setLogMechanic(e.target.value)}>
                <option value="">All mechanics</option>
                {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Vehicle plate</label>
              <input className="input" list="veh-list" value={logVehicle} onChange={e => setLogVehicle(e.target.value)} placeholder="Any vehicle…" />
              <datalist id="veh-list">{vehicles.map(v => <option key={v.devIdno} value={v.plate} />)}</datalist>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="card p-10 text-center text-gray-400">No work logs for the selected filter.</div>
          ) : (
            <div className="space-y-3">
              {logs.map(l => (
                <div key={l.id} className="card p-4">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{l.plate}</span>
                    <span className="text-xs text-gray-400">{fmtTs(l.recorded_at)}</span>
                    <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">🔧 {l.mechanic_name}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{l.note}</p>
                  {l.attachments?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                      {l.attachments.map(a => (
                        <a key={a.id} href={`/uploads/mechanic/${l.id}/${a.filename}`} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline border border-gray-200 rounded px-2 py-1">
                          {isImage(a.mime_type) ? '🖼' : '📄'} {a.original_name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Notes tab ── */}
      {tab === 'notes' && (
        <div className="space-y-4">
          {/* Add note form */}
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-700">Leave a note for mechanics on a vehicle</h2>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="label">Vehicle</label>
                <select className="input" value={noteVehicle} onChange={e => setNoteVehicle(e.target.value)}>
                  <option value="">Select vehicle…</option>
                  {vehicles.map(v => <option key={v.devIdno} value={v.devIdno}>{v.plate}</option>)}
                </select>
              </div>
            </div>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
              placeholder="Note for the mechanic assigned to this vehicle…"
              className="input w-full resize-none text-sm" />
            <div className="flex justify-end">
              <button onClick={addNote} disabled={savingNote} className="btn btn-primary">
                {savingNote ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>

          {/* All admin notes */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
              All vehicle notes ({adminNotes.length})
            </div>
            {adminNotes.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">No notes yet.</div>
            ) : adminNotes.map(n => (
              <div key={n.id} className="px-5 py-3 border-b border-gray-50 last:border-0 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800">{n.plate}</span>
                    <span className="text-xs text-gray-400">{fmtTs(n.created_at)}</span>
                    <span className="text-xs text-gray-500">by {n.created_by_name}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.note}</p>
                </div>
                <button onClick={() => deleteNote(n.id)} className="shrink-0 text-red-400 hover:text-red-600 text-sm">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function MechanicPortal() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
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
