import { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';

const LANG_BADGE = { Swahili: 'bg-blue-100 text-blue-700', English: 'bg-green-100 text-green-700', Both: 'bg-purple-100 text-purple-700' };

function TemplateModal({ template, onClose, onSave }) {
  const [form, setForm] = useState({
    name: template?.name || '',
    language: template?.language || 'Both',
    sectionsText: Array.isArray(template?.sections)
      ? template.sections.join('\n')
      : (template?.sections ? JSON.parse(template.sections).join('\n') : ''),
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const sections = form.sectionsText.split('\n').map(s => s.trim()).filter(Boolean);
    if (!sections.length) return toast.error('Add at least one section');
    setSaving(true);
    try {
      if (template?.id) {
        const { data } = await api.put(`/templates/${template.id}`, { name: form.name, language: form.language, sections });
        onSave(data, 'update');
      } else {
        const { data } = await api.post('/templates', { name: form.name, language: form.language, sections });
        onSave(data, 'create');
      }
      toast.success(template?.id ? 'Template updated' : 'Template created');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{template?.id ? 'Edit Template' : 'New Template'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Language</label>
            <select className="input" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
              <option>Swahili</option>
              <option>English</option>
              <option>Both</option>
            </select>
          </div>
          <div>
            <label className="label">Sections (one per line) *</label>
            <textarea
              className="input resize-none min-h-[160px] font-mono text-sm"
              value={form.sectionsText}
              onChange={e => setForm(f => ({ ...f, sectionsText: e.target.value }))}
              placeholder={"Utangulizi\nMuhtasari wa Safari\nMakosa Yanayodaiwa\n..."}
            />
            <p className="text-xs text-gray-400 mt-1">
              {form.sectionsText.split('\n').filter(s => s.trim()).length} sections
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Template'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = () => {
    api.get('/templates')
      .then(r => setTemplates(r.data))
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = (saved, type) => {
    if (type === 'create') setTemplates(t => [saved, ...t]);
    else setTemplates(t => t.map(x => x.id === saved.id ? saved : x));
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      await api.delete(`/templates/${id}`);
      setTemplates(t => t.filter(x => x.id !== id));
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const getSections = (t) => {
    try {
      return Array.isArray(t.sections) ? t.sections : JSON.parse(t.sections || '[]');
    } catch { return []; }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">Reusable section structures for incident reports</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Template
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => {
            const sections = getSections(t);
            return (
              <div key={t.id} className="card p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-gray-900 flex-1">{t.name}</h3>
                  <span className={`badge text-xs ${LANG_BADGE[t.language] || 'bg-gray-100 text-gray-600'}`}>
                    {t.language}
                  </span>
                </div>
                <div className="flex-1 mb-4">
                  <ol className="space-y-1">
                    {sections.map((s, i) => (
                      <li key={i} className="text-sm text-gray-600 flex gap-2">
                        <span className="text-gray-300 font-mono text-xs mt-0.5 shrink-0">{String(i + 1).padStart(2, '0')}.</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="text-xs text-gray-400 mb-3">{sections.length} sections</div>
                <div className="flex gap-2 border-t border-gray-100 pt-3">
                  <button onClick={() => setModal(t)} className="btn-secondary text-xs py-1 flex-1">Edit</button>
                  <button onClick={() => handleDelete(t.id, t.name)} className="btn-ghost text-xs py-1 text-red-500 hover:bg-red-50">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <TemplateModal
          template={modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
