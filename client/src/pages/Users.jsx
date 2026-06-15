import { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';

const ROLE_BADGE = {
  admin:    'bg-red-100 text-red-700',
  manager:  'bg-purple-100 text-purple-700',
  hr:       'bg-blue-100 text-blue-700',
  reporter: 'bg-gray-100 text-gray-600',
};

const STATUSES = [
  { value: 'ongoing',   label: 'Ongoing Investigation' },
  { value: 'completed', label: 'Completed Investigation' },
  { value: 'closed',    label: 'Closed (Hearing Done)' },
];

const TRACKING_PAGE_OPTS = [
  { key: 'daily_report', label: 'Daily fleet report' },
  { key: 'fuel_alerts', label: 'Fuel alerts' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'calibration', label: 'Calibration' },
  { key: 'danger_zones', label: 'Danger zones' },
];

const defaultTrackingPageAccess = () => ({
  daily_report: 'view',
  fuel_alerts: 'view',
  notifications: 'view',
  calibration: 'view',
  danger_zones: 'view',
});

// ─────────────────────── Roles Manager ───────────────────────────────────────

function RolesManager({ roles, onRolesChange }) {
  const [newRole, setNewRole] = useState('');
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!newRole.trim()) return;
    setAdding(true);
    try {
      const { data } = await api.post('/roles', { name: newRole.trim() });
      onRolesChange([...roles, data]);
      setNewRole('');
      toast.success(`Role "${data.name}" created`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create role');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (role) => {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      await api.delete(`/roles/${role.id}`);
      onRolesChange(roles.filter(r => r.id !== role.id));
      toast.success('Role deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete role');
    }
  };

  return (
    <div className="card p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Role Management</h2>
      <div className="flex flex-wrap gap-2 mb-3">
        {roles.map(r => (
          <span key={r.id} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${ROLE_BADGE[r.name] || 'bg-indigo-100 text-indigo-700'}`}>
            {r.name}
            {!r.is_system && (
              <button onClick={() => remove(r)} className="ml-0.5 text-current opacity-60 hover:opacity-100 text-sm leading-none">×</button>
            )}
            {r.is_system && <span className="opacity-40 text-[10px]">(system)</span>}
          </span>
        ))}
      </div>
      <div className="flex gap-2 max-w-sm">
        <input
          className="input flex-1 text-sm"
          value={newRole}
          onChange={e => setNewRole(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="New role name…"
        />
        <button onClick={add} disabled={adding || !newRole.trim()} className="btn btn-primary text-sm py-1.5">
          + Add
        </button>
      </div>
    </div>
  );
}

// ─────────────────────── User Modal ──────────────────────────────────────────

function UserModal({ user, drivers, cases, roles, onClose, onSave }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    name:                  user?.name || '',
    email:                 user?.email || '',
    password:              '',
    role:                  user?.role || 'reporter',
    is_active:             user?.is_active !== false,
    can_edit_reports:      user?.can_edit_reports || false,
    can_view_tracking:     user?.can_view_tracking || false,
    tracking_page_access:  user?.tracking_page_access || defaultTrackingPageAccess(),
    can_create_cases:      user?.can_create_cases !== false,
    can_edit_cases:        user?.can_edit_cases !== false,
    can_download_evidence: user?.can_download_evidence !== false,
    case_access:           user?.case_access || [],
    driver_access:         user?.driver_access || [],
    case_specific_access:  user?.case_specific_access || [],
  });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('info');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const toggle = (k) => setForm(f => ({ ...f, [k]: !f[k] }));

  const toggleList = (field, value) => {
    setForm(f => {
      const arr = f[field] || [];
      const numVal = typeof value === 'number' ? value : value;
      const next = arr.includes(numVal) ? arr.filter(x => x !== numVal) : [...arr, numVal];
      return { ...f, [field]: next };
    });
  };

  const selectAll = (field, values) => setForm(f => ({ ...f, [field]: values }));
  const clearAll = (field) => setForm(f => ({ ...f, [field]: [] }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name, email: form.email, role: form.role,
        is_active: form.is_active,
        can_edit_reports:      form.can_edit_reports,
        can_view_tracking:     form.can_view_tracking,
        tracking_page_access:  form.can_view_tracking ? form.tracking_page_access : null,
        can_create_cases:      form.can_create_cases,
        can_edit_cases:        form.can_edit_cases,
        can_download_evidence: form.can_download_evidence,
        case_access:          form.case_access?.length          ? form.case_access          : null,
        driver_access:        form.driver_access?.length        ? form.driver_access        : null,
        case_specific_access: form.case_specific_access?.length ? form.case_specific_access : null,
      };
      if (!isEdit) payload.password = form.password;

      if (isEdit) {
        const { data } = await api.put(`/users/${user.id}`, payload);
        toast.success('User updated');
        onSave(data);
      } else {
        const { data } = await api.post('/users', payload);
        toast.success(`User ${data.name} created`);
        onSave(data);
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = form.role === 'admin';
  const Tab = ({ id, label }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold">{isEdit ? `Edit: ${user.name}` : 'New User'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 shrink-0">
          <Tab id="info"    label="Profile" />
          <Tab id="perms"   label="Permissions" />
          <Tab id="access"  label="Data Access" />
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">

            {/* ── Profile tab ── */}
            {tab === 'info' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Full Name *</label>
                    <input className="input" value={form.name} onChange={set('name')} required />
                  </div>
                  <div>
                    <label className="label">Email *</label>
                    <input className="input" type="email" value={form.email} onChange={set('email')} required />
                  </div>
                </div>
                {!isEdit && (
                  <div>
                    <label className="label">Password *</label>
                    <input className="input" type="password" value={form.password} onChange={set('password')} required minLength={6} placeholder="Min 6 characters" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Role</label>
                    <select className="input" value={form.role} onChange={set('role')}>
                      {roles.map(r => (
                        <option key={r.id} value={r.name}>{r.name.charAt(0).toUpperCase() + r.name.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col justify-end gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.is_active} onChange={() => toggle('is_active')} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                      <span className="text-sm font-medium text-gray-700">Active account</span>
                    </label>
                  </div>
                </div>
              </>
            )}

            {/* ── Permissions tab ── */}
            {tab === 'perms' && (
              <div className="space-y-3">
                {isAdmin && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    Admin role grants full access to everything — individual permissions are ignored.
                  </div>
                )}
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Cases</p>
                {[
                  { key: 'can_create_cases',  label: 'Create new cases' },
                  { key: 'can_edit_cases',    label: 'Edit case details, timeline steps & evidence' },
                  { key: 'can_download_evidence', label: 'Download evidence files' },
                  { key: 'can_edit_reports',  label: 'Create & publish official reports' },
                  { key: 'can_view_tracking', label: 'Access Tracking / Daily Fleet Report' },
                ].map(({ key, label }) => (
                  <label key={key} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form[key] && !isAdmin ? 'border-brand-300 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'} ${isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isAdmin || !!form[key]}
                      onChange={() => !isAdmin && toggle(key)}
                      disabled={isAdmin}
                      className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
                {form.can_view_tracking && !isAdmin && (
                  <div className="ml-2 pl-4 border-l-2 border-brand-200 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fleet tracking pages</p>
                    {TRACKING_PAGE_OPTS.map(({ key, label }) => (
                      <div key={key} className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="min-w-[140px] text-gray-700">{label}</span>
                        <select
                          className="input text-sm py-1.5 max-w-[140px]"
                          value={form.tracking_page_access?.[key] || 'none'}
                          onChange={(e) => setForm((f) => ({
                            ...f,
                            tracking_page_access: {
                              ...(f.tracking_page_access || defaultTrackingPageAccess()),
                              [key]: e.target.value,
                            },
                          }))}
                        >
                          <option value="none">No access</option>
                          <option value="view">View only</option>
                          <option value="edit">Edit</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Data Access tab ── */}
            {tab === 'access' && (
              <div className="space-y-5">
                {isAdmin && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    Admin has unrestricted access to all data.
                  </div>
                )}

                {/* Status filter */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Case Status Access</p>
                  <p className="text-xs text-gray-400 mb-2">Unchecked = can see all statuses</p>
                  <div className="space-y-1.5">
                    {STATUSES.map(s => (
                      <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(form.case_access || []).includes(s.value)}
                          onChange={() => toggleList('case_access', s.value)}
                          disabled={isAdmin}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Specific cases */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Specific Cases</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => selectAll('case_specific_access', cases.map(c => c.id))} className="text-xs text-brand-600 hover:underline">All</button>
                      <button type="button" onClick={() => clearAll('case_specific_access')} className="text-xs text-gray-400 hover:underline">None</button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">None selected = driver/status filters apply instead</p>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
                    {cases.length === 0 ? (
                      <p className="text-xs text-gray-400 p-3">No cases found</p>
                    ) : cases.map(c => (
                      <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm">
                        <input
                          type="checkbox"
                          checked={(form.case_specific_access || []).includes(c.id)}
                          onChange={() => toggleList('case_specific_access', c.id)}
                          disabled={isAdmin}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="font-mono text-xs text-brand-600 shrink-0">{c.id}</span>
                        <span className="truncate text-gray-700">{c.title}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Specific drivers */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Specific Drivers</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => selectAll('driver_access', drivers.map(d => d.id))} className="text-xs text-brand-600 hover:underline">All</button>
                      <button type="button" onClick={() => clearAll('driver_access')} className="text-xs text-gray-400 hover:underline">None</button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">None selected = all drivers visible</p>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-44 overflow-y-auto">
                    {drivers.map(d => (
                      <label key={d.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm">
                        <input
                          type="checkbox"
                          checked={(form.driver_access || []).includes(d.id)}
                          onChange={() => toggleList('driver_access', d.id)}
                          disabled={isAdmin}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="truncate text-gray-700">{d.name}</span>
                        {d.vehicle_plate && <span className="text-xs text-gray-400 shrink-0">{d.vehicle_plate}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 pb-4 flex justify-end gap-3 shrink-0 border-t border-gray-100 pt-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────── Password Modal ──────────────────────────────────────

function PasswordModal({ user, onClose }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}/password`, { password });
      toast.success(`Password updated for ${user.name}`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Reset Password</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Setting new password for <strong>{user.name}</strong></p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">New Password *</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Min 6 characters" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Updating…' : 'Update Password'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────── Main Page ───────────────────────────────────────────

function permSummary(u) {
  if (u.role === 'admin') return 'Full admin access';
  const can = [];
  if (u.can_create_cases) can.push('Create');
  if (u.can_edit_cases) can.push('Edit');
  if (u.can_download_evidence) can.push('Download');
  if (u.can_edit_reports) can.push('Reports');
  if (u.can_view_tracking) can.push('Tracking');
  return can.length ? can.join(' · ') : 'View only';
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [cases, setCases] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [pwUser, setPwUser] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, dRes, cRes, rRes] = await Promise.all([
        api.get('/users'),
        api.get('/drivers'),
        api.get('/cases'),
        api.get('/roles'),
      ]);
      setUsers(uRes.data);
      setDrivers(dRes.data);
      setCases(cRes.data);
      setRoles(rRes.data);
    } catch {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = (saved) => {
    setUsers(prev => {
      const idx = prev.findIndex(u => u.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
  };

  const toggleActive = async (user) => {
    try {
      const { data } = await api.patch(`/users/${user.id}/toggle-active`);
      setUsers(prev => prev.map(u => u.id === data.id ? data : u));
      toast.success(`${data.name} is now ${data.is_active ? 'active' : 'inactive'}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to toggle status');
    }
  };

  const deleteUser = async (user) => {
    if (!confirm(`Delete user "${user.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      toast.success('User deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const modalProps = { drivers, cases, roles, onClose: () => { setShowNew(false); setEditUser(null); }, onSave: handleSave };

  return (
    <div className="p-6">
      {(showNew || editUser) && <UserModal user={editUser} {...modalProps} />}
      {pwUser && <PasswordModal user={pwUser} onClose={() => setPwUser(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New User
        </button>
      </div>

      <RolesManager roles={roles} onRolesChange={setRoles} />

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name', 'Email', 'Role', 'Status', 'Permissions', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${ROLE_BADGE[u.role] || 'bg-indigo-100 text-indigo-700'}`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(u)}
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${u.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                      title="Click to toggle"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                      {u.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{permSummary(u)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditUser(u)} className="btn btn-ghost text-xs py-1 px-2" title="Edit">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button onClick={() => setPwUser(u)} className="btn btn-ghost text-xs py-1 px-2 text-amber-500 hover:text-amber-700 hover:bg-amber-50" title="Reset password">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </button>
                      <button onClick={() => deleteUser(u)} className="btn btn-ghost text-xs py-1 px-2 text-red-500 hover:text-red-700 hover:bg-red-50" title="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
