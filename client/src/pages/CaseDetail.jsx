import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { downloadFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import TimelineBuilder from '../components/TimelineBuilder';
import GeneralEvidence from '../components/GeneralEvidence';
import EvidenceBlock from '../components/EvidenceBlock';

const isHtmlContent = (s) => s && /<[a-z][\s\S]*>/i.test(s);

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

const STATUS_COLOR = {
  ongoing:   { bar: 'bg-amber-400', bg: 'from-amber-50 to-orange-50', icon: 'text-amber-500' },
  completed: { bar: 'bg-green-400', bg: 'from-green-50 to-emerald-50', icon: 'text-green-500' },
  closed:    { bar: 'bg-gray-400', bg: 'from-gray-50 to-slate-50', icon: 'text-gray-500' },
};

const SEV_COLOR = {
  low:    'bg-blue-100 text-blue-700',
  medium: 'bg-amber-100 text-amber-700',
  high:   'bg-red-100 text-red-700',
};

const SEVERITIES = ['low', 'medium', 'high'];

// ────── View mode stat card ──────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
      <div className="text-gray-400 mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</div>
        <div className="text-sm font-semibold text-gray-800 truncate">{value || '—'}</div>
        {sub && <div className="text-xs text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

// ────── View Mode ─────────────────────────────────────────────────────────────

function ViewMode({ caseData, steps, setSteps, linkedDrivers, generalEvidence, setGeneralEvidence, onEdit, canEdit, id, handleDownload, handleUnlinkDriver, handleLinkDriver, availableDrivers, templates, applyTemplate }) {
  const { user } = useAuth();
  const sc = STATUS_COLOR[caseData.status] || STATUS_COLOR.ongoing;
  const canDownload = user?.role === 'admin' || user?.can_download_evidence;
  const canUpload = user?.role === 'admin' || user?.can_edit_cases;

  const formatDate = (d) => {
    if (!d) return null;
    const date = new Date(d);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link to={linkedDrivers.length === 1 ? `/drivers/${linkedDrivers[0].id}` : '/cases'} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className={`h-5 w-1 rounded-full ${sc.bar}`} />
        <span className="font-mono text-sm font-bold text-brand-600">{id}</span>
        <span className={STATUS_BADGE[caseData.status] || 'badge'}>{STATUS_OPTIONS.find(s => s.value === caseData.status)?.label || caseData.status}</span>
        <span className={`badge ${SEV_COLOR[caseData.severity] || 'bg-gray-100 text-gray-600'} capitalize`}>{caseData.severity}</span>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <button onClick={onEdit} className="btn btn-primary text-sm py-1.5 gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit Case
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main */}
        <div className="flex-1 overflow-y-auto">
          {/* Hero banner */}
          <div className={`bg-gradient-to-r ${sc.bg} border-b border-gray-100 px-8 py-6`}>
            <h1 className="text-2xl font-bold text-gray-900 mb-4 leading-snug">{caseData.title}</h1>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                label="Incident Date"
                value={formatDate(caseData.incident_date)}
              />
              <StatCard
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l1 1h1m8-1V8a1 1 0 011-1h2l3 4v4a1 1 0 01-1 1h-1M5 17h8" /></svg>}
                label="Vehicle Plate"
                value={caseData.vehicle_plate || '—'}
              />
              <StatCard
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                label="Driver(s)"
                value={linkedDrivers.length ? linkedDrivers.map(d => d.name).join(', ') : 'None linked'}
              />
              <StatCard
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" /></svg>}
                label="Timeline Steps"
                value={steps.length.toString()}
                sub={`${generalEvidence.length} evidence file${generalEvidence.length !== 1 ? 's' : ''}`}
              />
            </div>
          </div>

          {/* Timeline read-only */}
          <div className="px-8 py-6 space-y-6">
            {steps.length > 0 ? (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Incident Timeline</h2>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                  <div className="space-y-4">
                    {steps.map((step, idx) => (
                      <div key={step.id} className="relative pl-10">
                        <div className="absolute left-2.5 top-2.5 w-3 h-3 rounded-full bg-brand-500 border-2 border-white shadow" />
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-gray-400">Step {idx + 1}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${step.type === 'text' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>{step.type}</span>
                          </div>
                          <div className="font-medium text-gray-800 text-sm mb-2">{step.label}</div>
                          {step.content && (
                            isHtmlContent(step.content)
                              ? <div className="prose prose-sm max-w-none text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-100 [&_mark]:bg-yellow-200 [&_mark]:px-0.5" dangerouslySetInnerHTML={{ __html: step.content }} />
                              : <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">{step.content}</div>
                          )}
                          {/* Step evidence — full cards with descriptions, upload (if permitted), download */}
                          <div className="mt-3">
                            <EvidenceBlock
                              step={step}
                              readOnly={!canUpload}
                              canDownload={canDownload}
                              onChange={(updated) => setSteps(prev => prev.map(s => s.id === step.id ? { ...s, ...updated } : s))}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <p className="text-sm">No timeline steps added yet</p>
              </div>
            )}

            {/* Evidence files — always show component (read-only or uploadable) */}
            <GeneralEvidence
              caseId={id}
              files={generalEvidence}
              setFiles={setGeneralEvidence}
              readOnly={!canUpload}
              canDownload={canDownload}
            />
          </div>
        </div>

        {/* Right panel */}
        <aside className="w-56 shrink-0 border-l border-gray-100 bg-white p-4 overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <Link to={`/cases/${id}/report`} className="btn btn-primary w-full justify-center text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Official Report
            </Link>
            <Link to={`/cases/${id}/preview`} className="btn btn-secondary w-full justify-center text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              Preview
            </Link>
            <button onClick={() => handleDownload('pdf')} className="btn btn-secondary w-full justify-center text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              Download PDF
            </button>
            <button onClick={() => handleDownload('docx')} className="btn btn-secondary w-full justify-center text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Download Word
            </button>
          </div>

          {/* Drivers */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Connected Drivers</h3>
            <div className="space-y-1.5 mb-2">
              {linkedDrivers.length === 0 ? (
                <p className="text-xs text-gray-400">No drivers linked</p>
              ) : linkedDrivers.map(d => (
                <Link key={d.id} to={`/drivers/${d.id}`} className="flex items-center gap-2 bg-brand-50 rounded-lg px-2.5 py-1.5 group">
                  <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                    {d.name.charAt(0)}
                  </div>
                  <span className="text-xs font-medium text-brand-700 group-hover:underline truncate">{d.name}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Created info */}
          {caseData.created_at && (
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-1">
              <div className="text-xs text-gray-400">
                <span className="font-medium">Created:</span> {new Date(caseData.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ────── Edit Mode ─────────────────────────────────────────────────────────────

function EditMode({ id, meta, setMeta, metaDirty, setMetaDirty, saving, onSave, onView, steps, setSteps, generalEvidence, setGeneralEvidence, linkedDrivers, setLinkedDrivers, allDrivers, templates, deleteCase }) {
  const setM = (k) => (e) => {
    setMeta(m => ({ ...m, [k]: e.target.value }));
    setMetaDirty(true);
  };

  const handleLinkDriver = async (driverId) => {
    try {
      const { data } = await api.post(`/cases/${id}/drivers/${driverId}`);
      setLinkedDrivers(data);
      toast.success('Driver linked');
    } catch {
      toast.error('Failed to link driver');
    }
  };

  const handleUnlinkDriver = async (driverId) => {
    try {
      await api.delete(`/cases/${id}/drivers/${driverId}`);
      setLinkedDrivers(prev => prev.filter(d => d.id !== driverId));
      toast.success('Driver removed');
    } catch {
      toast.error('Failed to remove driver');
    }
  };

  const applyTemplate = async (templateId) => {
    const tmpl = templates.find(t => t.id === parseInt(templateId));
    if (!tmpl) return;
    const sections = Array.isArray(tmpl.sections) ? tmpl.sections : JSON.parse(tmpl.sections || '[]');
    if (!confirm(`Apply template "${tmpl.name}"? This will add ${sections.length} text steps.`)) return;
    try {
      for (const section of sections) {
        const { data: step } = await api.post(`/cases/${id}/steps`, { type: 'text', label: section, content: '' });
        setSteps(prev => [...prev, { ...step, files: [] }]);
      }
      toast.success(`Applied template: ${tmpl.name}`);
    } catch {
      toast.error('Failed to apply template');
    }
  };

  const availableDrivers = allDrivers.filter(d => !linkedDrivers.find(l => l.id === d.id));

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-amber-50 border-b-2 border-amber-300 px-6 py-3 flex items-center gap-3">
        <button onClick={onView} className="text-amber-600 hover:text-amber-800">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          <span className="text-sm font-semibold text-amber-800">Editing case</span>
          <span className="font-mono text-sm font-bold text-brand-600">{id}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {metaDirty && <span className="text-xs text-amber-700 font-medium bg-amber-100 px-2 py-0.5 rounded-full">Unsaved changes</span>}
          <button onClick={onView} className="btn btn-secondary text-sm py-1.5">
            Cancel
          </button>
          <button onClick={onSave} disabled={saving || !metaDirty} className="btn btn-primary text-sm py-1.5">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="card p-5 ring-2 ring-amber-200">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Case Details</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Title</label>
                <input className="input text-base" value={meta.title} onChange={setM('title')} />
              </div>
              <div>
                <label className="label">Vehicle Plate</label>
                <input className="input" value={meta.vehicle_plate} onChange={setM('vehicle_plate')} placeholder="T.623 EMB" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Incident Date</label>
                  <input className="input" type="date" value={meta.incident_date} onChange={setM('incident_date')} />
                </div>
                <div>
                  <label className="label">Investigation Status</label>
                  <select className="input" value={meta.status} onChange={setM('status')}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Severity</label>
                  <select className="input" value={meta.severity} onChange={setM('severity')}>
                    {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Incident Timeline — {steps.length} step{steps.length !== 1 ? 's' : ''}
              </h2>
              <span className="text-xs text-gray-400">Drag to reorder</span>
            </div>
            <TimelineBuilder caseId={id} steps={steps} setSteps={setSteps} />
          </div>

          <GeneralEvidence caseId={id} files={generalEvidence} setFiles={setGeneralEvidence} />
        </div>

        {/* Right panel */}
        <aside className="w-56 shrink-0 border-l border-gray-200 bg-gray-50 p-4 overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Actions</h3>

          <div className="space-y-2">
            <Link to={`/cases/${id}/report`} className="btn btn-primary w-full justify-center text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Official Report
            </Link>
          </div>

          {/* Connected Drivers */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Connected Drivers</h3>
            <div className="space-y-1.5 mb-2">
              {linkedDrivers.length === 0 && <p className="text-xs text-gray-400">No drivers linked</p>}
              {linkedDrivers.map(d => (
                <div key={d.id} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1.5">
                  <Link to={`/drivers/${d.id}`} className="text-xs font-medium text-brand-600 hover:underline flex-1 truncate">{d.name}</Link>
                  <button onClick={() => handleUnlinkDriver(d.id)} className="text-gray-400 hover:text-red-500 shrink-0 leading-none">✕</button>
                </div>
              ))}
            </div>
            {availableDrivers.length > 0 && (
              <select className="input text-xs" value="" onChange={(e) => { if (e.target.value) { handleLinkDriver(e.target.value); e.target.value = ''; } }}>
                <option value="" disabled>Link a driver…</option>
                {availableDrivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
          </div>

          {/* Apply Template */}
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Apply Template</h3>
            <select className="input text-sm" defaultValue="" onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); e.target.value = ''; }}>
              <option value="" disabled>Choose template…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="mt-5 pt-5 border-t border-gray-200">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Danger Zone</h3>
            <button onClick={deleteCase} className="btn btn-danger w-full justify-center text-sm">Delete Case</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ────── Main Component ────────────────────────────────────────────────────────

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState('view');
  const [caseData, setCaseData] = useState(null);
  const [steps, setSteps] = useState([]);
  const [generalEvidence, setGeneralEvidence] = useState([]);
  const [linkedDrivers, setLinkedDrivers] = useState([]);
  const [allDrivers, setAllDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState({});
  const [metaDirty, setMetaDirty] = useState(false);
  const [templates, setTemplates] = useState([]);
  const autoSaveRef = useRef(null);

  const canEdit = user?.role === 'admin' || !!user?.can_edit_cases;

  const load = async () => {
    setLoading(true);
    try {
      const [caseRes, tmplRes] = await Promise.all([
        api.get(`/cases/${id}`),
        api.get('/templates'),
      ]);
      const c = caseRes.data;
      setCaseData(c);
      setMeta({
        title: c.title,
        vehicle_plate: c.vehicle_plate || '',
        incident_date: c.incident_date ? c.incident_date.split('T')[0] : '',
        status: c.status,
        severity: c.severity,
      });
      setSteps(c.steps || []);
      setGeneralEvidence(c.generalEvidence || []);
      setLinkedDrivers(c.drivers || []);
      setTemplates(tmplRes.data);
    } catch {
      toast.error('Failed to load case');
      navigate('/cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { api.get('/drivers').then(r => setAllDrivers(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    autoSaveRef.current = setInterval(async () => {
      if (!metaDirty) return;
      try {
        await api.put(`/cases/${id}`, meta);
        setMetaDirty(false);
        toast('Auto-saved', { icon: '💾', duration: 1500 });
      } catch {}
    }, 30000);
    return () => clearInterval(autoSaveRef.current);
  }, [id, meta, metaDirty]);

  const saveMetadata = async () => {
    setSaving(true);
    try {
      await api.put(`/cases/${id}`, meta);
      setCaseData(c => ({ ...c, ...meta }));
      setMetaDirty(false);
      toast.success('Saved');
      setMode('view');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteCase = async () => {
    if (!confirm(`Delete case ${id}? This cannot be undone.`)) return;
    try {
      await api.delete(`/cases/${id}`);
      toast.success('Case deleted');
      navigate(linkedDrivers.length === 1 ? `/drivers/${linkedDrivers[0].id}` : '/cases');
    } catch {
      toast.error('Delete failed');
    }
  };

  const handleDownload = async (format) => {
    try {
      await downloadFile(`/cases/${id}/export/${format}`, `${id}.${format}`);
    } catch {
      toast.error('Download failed');
    }
  };

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin w-8 h-8 text-brand-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-gray-500">Loading case…</p>
      </div>
    </div>
  );

  const sharedProps = {
    id, steps, setSteps, generalEvidence, setGeneralEvidence,
    linkedDrivers, setLinkedDrivers, allDrivers, templates,
    deleteCase, handleDownload,
    availableDrivers: allDrivers.filter(d => !linkedDrivers.find(l => l.id === d.id)),
  };

  if (mode === 'edit') {
    return (
      <EditMode
        {...sharedProps}
        meta={meta} setMeta={setMeta}
        metaDirty={metaDirty} setMetaDirty={setMetaDirty}
        saving={saving}
        onSave={saveMetadata}
        onView={() => setMode('view')}
      />
    );
  }

  return (
    <ViewMode
      {...sharedProps}
      caseData={{ ...caseData, ...meta }}
      canEdit={canEdit}
      onEdit={() => setMode('edit')}
      setSteps={setSteps}
      setGeneralEvidence={setGeneralEvidence}
      handleLinkDriver={async (driverId) => {
        try {
          const { data } = await api.post(`/cases/${id}/drivers/${driverId}`);
          setLinkedDrivers(data);
          toast.success('Driver linked');
        } catch { toast.error('Failed'); }
      }}
      handleUnlinkDriver={async (driverId) => {
        try {
          await api.delete(`/cases/${id}/drivers/${driverId}`);
          setLinkedDrivers(prev => prev.filter(d => d.id !== driverId));
          toast.success('Driver removed');
        } catch { toast.error('Failed'); }
      }}
      applyTemplate={async (templateId) => {
        const tmpl = templates.find(t => t.id === parseInt(templateId));
        if (!tmpl) return;
        const sections = Array.isArray(tmpl.sections) ? tmpl.sections : JSON.parse(tmpl.sections || '[]');
        if (!confirm(`Apply template "${tmpl.name}"?`)) return;
        try {
          for (const section of sections) {
            const { data: step } = await api.post(`/cases/${id}/steps`, { type: 'text', label: section, content: '' });
            setSteps(prev => [...prev, { ...step, files: [] }]);
          }
          toast.success(`Applied: ${tmpl.name}`);
        } catch { toast.error('Failed'); }
      }}
    />
  );
}
