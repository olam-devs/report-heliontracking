import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: 'ongoing',   label: 'Ongoing Investigation' },
  { value: 'completed', label: 'Completed Investigation' },
  { value: 'closed',    label: 'Closed (Hearing Done)' },
];

const STATUS_BADGE = {
  ongoing:   'badge-ongoing',
  completed: 'badge-completed',
  closed:    'badge-closed',
};

const STATUS_LABEL = {
  ongoing:   'Ongoing',
  completed: 'Completed',
  closed:    'Closed',
};

function NewReportModal({ driver, onClose, onCreate }) {
  const [form, setForm] = useState({
    title: '',
    vehicle_plate: driver.vehicle_plate || '',
    incident_date: '',
    status: 'ongoing',
    severity: 'medium',
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/cases', {
        ...form,
        driver_id: driver.id,
      });
      toast.success(`Report ${data.id} created`);
      onCreate(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold">New Report</h2>
            <p className="text-sm text-gray-500">For {driver.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Report Title *</label>
            <input className="input" value={form.title} onChange={set('title')} required placeholder="e.g. Matumizi Mabaya ya Gari…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vehicle Plate</label>
              <input className="input" value={form.vehicle_plate} onChange={set('vehicle_plate')} placeholder="T.623 EMB" />
            </div>
            <div>
              <label className="label">Incident Date</label>
              <input className="input" type="date" value={form.incident_date} onChange={set('incident_date')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Investigation Status</label>
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
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Report'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LinkCaseModal({ driver, onClose, onLink }) {
  const [caseId, setCaseId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = caseId.trim().toUpperCase();
    setSaving(true);
    try {
      await api.post(`/drivers/${driver.id}/cases/${trimmed}`);
      toast.success(`Case ${trimmed} linked to ${driver.name}`);
      onLink();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to link case');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Link Existing Case</h2>
            <p className="text-sm text-gray-500">To {driver.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Case ID</label>
            <input
              className="input font-mono uppercase"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="INC-001"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button type="submit" className="btn-primary text-sm" disabled={saving}>
              {saving ? 'Linking…' : 'Link Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditDriverModal({ driver, onClose, onSave }) {
  const [form, setForm] = useState({
    name: driver.name || '',
    vehicle_plate: driver.vehicle_plate || '',
    employee_id: driver.employee_id || '',
    notes: driver.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put(`/drivers/${driver.id}`, form);
      toast.success('Driver updated');
      onSave(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Edit Driver</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Driver Name *</label>
            <input className="input" value={form.name} onChange={set('name')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vehicle Plate</label>
              <input className="input" value={form.vehicle_plate} onChange={set('vehicle_plate')} />
            </div>
            <div>
              <label className="label">Employee ID</label>
              <input className="input" value={form.employee_id} onChange={set('employee_id')} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={set('notes')} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DriverDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [driver, setDriver] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showNewReport, setShowNewReport] = useState(false);
  const [showLinkCase, setShowLinkCase] = useState(false);
  const [showEditDriver, setShowEditDriver] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/drivers/${id}`);
      setDriver(data);
      setCases(data.cases || []);
    } catch {
      toast.error('Failed to load driver');
      navigate('/drivers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const deleteDriver = async () => {
    if (!confirm(`Delete driver "${driver.name}"? Their reports will remain but be unlinked.`)) return;
    try {
      await api.delete(`/drivers/${id}`);
      toast.success('Driver deleted');
      navigate('/drivers');
    } catch {
      toast.error('Delete failed');
    }
  };

  const unlinkCase = async (caseId, e) => {
    e.stopPropagation();
    if (!confirm(`Unlink case ${caseId} from this driver?`)) return;
    try {
      await api.delete(`/drivers/${id}/cases/${caseId}`);
      setCases(prev => prev.filter(c => c.id !== caseId));
      toast.success('Case unlinked');
    } catch {
      toast.error('Failed to unlink case');
    }
  };

  const visibleCases = statusFilter ? cases.filter(c => c.status === statusFilter) : cases;
  const counts = cases.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {});

  if (loading) return <div className="p-6 text-center text-gray-500">Loading…</div>;
  if (!driver) return null;

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-5">
        <Link to="/drivers" className="hover:text-gray-700">Drivers</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{driver.name}</span>
      </div>

      {/* Driver header */}
      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{driver.name}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
              {driver.vehicle_plate && (
                <span className="flex items-center gap-1">
                  <span className="text-gray-400">Plate:</span>
                  <span className="font-mono font-medium">{driver.vehicle_plate}</span>
                </span>
              )}
              {driver.employee_id && (
                <span className="flex items-center gap-1">
                  <span className="text-gray-400">ID:</span>
                  <span>{driver.employee_id}</span>
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="text-gray-400">Reports:</span>
                <span className="font-medium">{cases.length}</span>
              </span>
            </div>
            {driver.notes && <p className="mt-2 text-sm text-gray-500">{driver.notes}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowEditDriver(true)} className="btn-secondary text-sm">Edit</button>
            <button onClick={deleteDriver} className="btn-danger text-sm">Delete</button>
          </div>
        </div>
      </div>

      {/* Reports section */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Reports</h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[{ value: '', label: `All (${cases.length})` },
              { value: 'ongoing',   label: `Ongoing (${counts.ongoing || 0})` },
              { value: 'completed', label: `Completed (${counts.completed || 0})` },
              { value: 'closed',    label: `Closed (${counts.closed || 0})` },
            ].map(tab => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === tab.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowLinkCase(true)} className="btn-secondary text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Link Case
          </button>
          <button onClick={() => setShowNewReport(true)} className="btn-primary text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Report
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {visibleCases.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500">
              {statusFilter ? `No ${statusFilter} reports.` : 'No reports yet. Create the first one.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Report ID', 'Title', 'Vehicle', 'Date', 'Status', 'Severity', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleCases.map(c => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/cases/${c.id}`)}
                >
                  <td className="px-4 py-3 font-mono font-medium text-brand-600">{c.id}</td>
                  <td className="px-4 py-3 max-w-xs truncate font-medium text-gray-900">{c.title}</td>
                  <td className="px-4 py-3 text-gray-600">{c.vehicle_plate || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {c.incident_date ? new Date(c.incident_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_BADGE[c.status] || 'badge'}>{STATUS_LABEL[c.status] || c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge-${c.severity}`}>{c.severity}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => unlinkCase(c.id, e)}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                      title="Unlink case from driver"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNewReport && (
        <NewReportModal
          driver={driver}
          onClose={() => setShowNewReport(false)}
          onCreate={(c) => navigate(`/cases/${c.id}`)}
        />
      )}
      {showLinkCase && (
        <LinkCaseModal
          driver={driver}
          onClose={() => setShowLinkCase(false)}
          onLink={load}
        />
      )}
      {showEditDriver && (
        <EditDriverModal
          driver={driver}
          onClose={() => setShowEditDriver(false)}
          onSave={(updated) => setDriver(d => ({ ...d, ...updated }))}
        />
      )}
    </div>
  );
}
