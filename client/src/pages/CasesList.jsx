import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = [
  { value: 'ongoing',   label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed',    label: 'Closed' },
];

const STATUS_BADGE = {
  ongoing:   'badge-ongoing',
  completed: 'badge-completed',
  closed:    'badge-closed',
};

const SEVERITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

function NewCaseModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    title: '', vehicle_plate: '',
    incident_date: '', severity: 'medium', status: 'ongoing',
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/cases', form);
      toast.success(`Case ${data.id} created`);
      onCreate(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create case');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">New Incident Case</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={form.title} onChange={set('title')} required placeholder="e.g. Matumizi Mabaya ya Gari..." />
          </div>
          <div>
            <label className="label">Vehicle Plate</label>
            <input className="input" value={form.vehicle_plate} onChange={set('vehicle_plate')} placeholder="T.623 EMB" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Incident Date</label>
              <input className="input" type="date" value={form.incident_date} onChange={set('incident_date')} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={set('status')}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Severity</label>
              <select className="input" value={form.severity} onChange={set('severity')}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400">Link this case to a driver after creation from the case page.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Case'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HearingModal({ caseId, current, onClose, onSaved }) {
  const [dateVal, setDateVal] = useState(current ? current.split('T')[0] : '');
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.stopPropagation();
    if (!dateVal) return;
    setSaving(true);
    try {
      await api.put(`/cases/${caseId}/hearing`, { hearing_date: dateVal });
      onSaved(caseId, dateVal);
      toast.success('Hearing date saved');
      onClose();
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const clear = async (e) => {
    e.stopPropagation();
    setSaving(true);
    try {
      await api.delete(`/cases/${caseId}/hearing`);
      onSaved(caseId, null);
      toast.success('Hearing date removed');
      onClose();
    } catch { toast.error('Failed to remove'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-5 w-72" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 text-sm">{current ? 'Edit Hearing Date' : 'Set Hearing Date'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>
        <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)}
          className="input w-full mb-3" autoFocus />
        <div className="flex gap-2 justify-between">
          {current && (
            <button onClick={clear} disabled={saving} className="btn btn-secondary text-xs text-red-600 hover:bg-red-50">
              Clear
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="btn btn-secondary text-xs">Cancel</button>
            <button onClick={save} disabled={saving || !dateVal} className="btn btn-primary text-xs">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HearingCell({ c, canManage, onOpenModal }) {
  if (c.status !== 'completed') return <span className="text-gray-300 text-xs">—</span>;

  const stop = (e) => e.stopPropagation();

  if (!c.hearing_date) {
    return (
      <button
        onClick={(e) => { stop(e); onOpenModal(c); }}
        className="text-xs px-2 py-1 rounded-lg border border-dashed border-amber-400 text-amber-600 hover:bg-amber-50 whitespace-nowrap font-medium"
      >
        + Set date
      </button>
    );
  }

  const days = Math.round((new Date(c.hearing_date) - new Date(new Date().toDateString())) / 86400000);
  const isPast = days < 0;
  const label = isPast ? 'Passed' : days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days}d left`;
  const color = isPast ? 'text-gray-400' : days <= 1 ? 'text-red-600 font-bold' : days <= 3 ? 'text-orange-600 font-semibold' : 'text-amber-700 font-medium';

  return (
    <div className="flex items-center gap-1.5" onClick={stop}>
      <span className={`text-xs whitespace-nowrap ${color}`}>{label}</span>
      {canManage && (
        <button
          onClick={(e) => { stop(e); onOpenModal(c); }}
          className="text-gray-400 hover:text-brand-600 shrink-0"
          title="Edit hearing date"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function CasesList() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin' || user?.role === 'hr';
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [hearingModal, setHearingModal] = useState(null);
  const [hearingPopup, setHearingPopup] = useState([]);
  const [filters, setFilters] = useState({ status: '', severity: '', search: '' });
  const navigate = useNavigate();

  useEffect(() => {
    if (sessionStorage.getItem('hearing_cases_shown')) return;
    api.get('/cases/hearings/upcoming').then(r => {
      if (r.data.length > 0) setHearingPopup(r.data);
    }).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status)   params.status = filters.status;
      if (filters.severity) params.severity = filters.severity;
      if (filters.search)   params.search = filters.search;
      const { data } = await api.get('/cases', { params });
      setCases(data);
    } catch {
      toast.error('Failed to load cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);

  const setFilter = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Cases</h1>
          <p className="text-sm text-gray-500 mt-0.5">{cases.length} case{cases.length !== 1 ? 's' : ''} found</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Case
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          className="input max-w-xs"
          placeholder="Search vehicle, driver, title…"
          value={filters.search}
          onChange={setFilter('search')}
        />
        <select className="input w-44" value={filters.status} onChange={setFilter('status')}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="input w-40" value={filters.severity} onChange={setFilter('severity')}>
          <option value="">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        {(filters.status || filters.severity || filters.search) && (
          <button onClick={() => setFilters({ status: '', severity: '', search: '' })} className="btn-ghost text-xs">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : cases.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500">No cases found.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Case ID', 'Title', 'Vehicle', 'Driver', 'Date', 'Status', 'Severity', 'Hearing', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cases.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/cases/${c.id}`)}>
                  <td className="px-4 py-3 font-mono font-medium text-brand-600">{c.id}</td>
                  <td className="px-4 py-3 max-w-xs truncate font-medium text-gray-900">{c.title}</td>
                  <td className="px-4 py-3 text-gray-600">{c.vehicle_plate || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">{c.driver_names || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {c.incident_date ? new Date(c.incident_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_BADGE[c.status] || 'badge'}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge-${c.severity}`}>{SEVERITY_LABELS[c.severity]}</span>
                  </td>
                  <td className="px-4 py-3">
                    {canManage
                      ? <HearingCell c={c} canManage={canManage} onOpenModal={setHearingModal} />
                      : c.hearing_date && c.status === 'completed'
                        ? (() => {
                            const days = Math.round((new Date(c.hearing_date) - new Date(new Date().toDateString())) / 86400000);
                            const isPast = days < 0;
                            const label = isPast ? 'Passed' : days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days}d left`;
                            const color = isPast ? 'text-gray-400' : days <= 1 ? 'text-red-600 font-bold' : days <= 3 ? 'text-orange-600 font-semibold' : 'text-amber-700 font-medium';
                            return <span className={`text-xs ${color}`}>{label}</span>;
                          })()
                        : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {hearingPopup.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-amber-500 px-6 py-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h2 className="text-white font-bold text-sm">Upcoming Hearing{hearingPopup.length > 1 ? 's' : ''} ({hearingPopup.length})</h2>
            </div>
            <div className="px-6 py-4 space-y-2 max-h-72 overflow-y-auto">
              {hearingPopup.map(h => {
                const days = Math.round((new Date(h.hearing_date) - new Date(new Date().toDateString())) / 86400000);
                const isPast = days < 0;
                const label = isPast ? 'Passed' : days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `In ${days} days`;
                const color = isPast ? 'text-gray-400' : days <= 1 ? 'text-red-600 font-bold' : days <= 3 ? 'text-orange-600 font-semibold' : 'text-amber-700 font-medium';
                const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
                return (
                  <div key={h.id} className="border border-amber-100 rounded-xl p-3 bg-amber-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          onClick={() => { sessionStorage.setItem('hearing_cases_shown', '1'); setHearingPopup([]); navigate(`/cases/${h.id}`); }}
                          className="text-sm font-semibold text-gray-800 hover:text-amber-700 hover:underline text-left truncate block max-w-[200px]"
                        >
                          {h.id} — {h.title}
                        </button>
                        {h.vehicle_plate && <div className="text-xs text-gray-500 mt-0.5">Vehicle: {h.vehicle_plate}</div>}
                        {h.hearing_notes && <div className="text-xs text-gray-500 mt-1 leading-relaxed">{h.hearing_notes}</div>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs text-gray-500">{fmt(h.hearing_date)}</div>
                        <div className={`text-xs mt-0.5 ${color}`}>{label}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => { sessionStorage.setItem('hearing_cases_shown', '1'); setHearingPopup([]); }}
                className="btn btn-primary text-sm"
              >
                OK, got it
              </button>
            </div>
          </div>
        </div>
      )}

      {showNew && <NewCaseModal onClose={() => setShowNew(false)} onCreate={(c) => navigate(`/cases/${c.id}`)} />}
      {hearingModal && (
        <HearingModal
          caseId={hearingModal.id}
          current={hearingModal.hearing_date}
          onClose={() => setHearingModal(null)}
          onSaved={(id, date) => setCases(prev => prev.map(c => c.id === id ? { ...c, hearing_date: date } : c))}
        />
      )}
    </div>
  );
}
