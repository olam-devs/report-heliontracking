import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';

function NewDriverModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', vehicle_plate: '', employee_id: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/drivers', form);
      toast.success(`Driver "${data.name}" created`);
      onCreate(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create driver');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">New Driver Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Driver Name *</label>
            <input className="input" value={form.name} onChange={set('name')} required placeholder="e.g. Bw. John Doe" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vehicle Plate</label>
              <input className="input" value={form.vehicle_plate} onChange={set('vehicle_plate')} placeholder="T.623 EMB" />
            </div>
            <div>
              <label className="label">Employee ID</label>
              <input className="input" value={form.employee_id} onChange={set('employee_id')} placeholder="EMP-001" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={set('notes')} placeholder="Optional notes…" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Driver'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const STATUS_DOT = { ongoing: 'bg-amber-400', completed: 'bg-blue-400', closed: 'bg-green-400' };

function CaseDots({ cases = [] }) {
  const counts = { ongoing: 0, completed: 0, closed: 0 };
  for (const c of cases) counts[c.status] = (counts[c.status] || 0) + 1;
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      {Object.entries(counts).map(([s, n]) => n > 0 && (
        <span key={s} className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s] || 'bg-gray-300'}`} />
          {n} {s}
        </span>
      ))}
    </div>
  );
}

export default function DriversList() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const params = search ? { search } : {};
      const { data } = await api.get('/drivers', { params });
      setDrivers(data);
    } catch {
      toast.error('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{drivers.length} driver{drivers.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Driver
        </button>
      </div>

      <div className="mb-5">
        <input
          className="input max-w-xs"
          placeholder="Search name, plate, employee ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : drivers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🚗</div>
            <p className="text-gray-500">No drivers found. Add the first one.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Driver', 'Vehicle Plate', 'Employee ID', 'Cases', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {drivers.map(d => (
                <tr
                  key={d.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/drivers/${d.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{d.vehicle_plate || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{d.employee_id || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-brand-600 font-medium">
                      {d.case_count}
                      <span className="text-gray-400 font-normal">report{d.case_count !== 1 ? 's' : ''}</span>
                    </span>
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

      {showNew && (
        <NewDriverModal
          onClose={() => setShowNew(false)}
          onCreate={(d) => navigate(`/drivers/${d.id}`)}
        />
      )}
    </div>
  );
}
