import { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import TipTapEditor from '../components/TipTapEditor';

function TemplateEditorModal({ template, onSave, onClose }) {
  const isNew = !template?.id;
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [content, setContent] = useState(template?.content || '<p>Start writing your template here.</p>');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      await onSave({ name, description, content });
      onClose();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex flex-col z-50">
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none font-bold">×</button>
        <h2 className="font-semibold text-gray-800 flex-1">{isNew ? 'New Template' : `Edit: ${template.name}`}</h2>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary text-sm">
          {saving ? 'Saving…' : '💾 Save Template'}
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="label">Template Name *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Standard Incident Report" />
            </div>
            <div className="flex-1">
              <label className="label">Description</label>
              <input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description…" />
            </div>
          </div>
          <div>
            <label className="label mb-2 block">Template Content</label>
            <p className="text-xs text-gray-500 mb-2">
              Use placeholders: <code className="bg-gray-100 px-1 rounded">{'{{case_id}}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{incident_date}}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{vehicle_plate}}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{driver_names}}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{status}}'}</code>{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{severity}}'}</code>{' '}
              — these are auto-filled when a user creates a report from this template.
            </p>
            <TipTapEditor content={content} onChange={setContent} editable={true} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/report-templates');
      setTemplates(data);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createTemplate = async (fields) => {
    const { data } = await api.post('/report-templates', fields);
    setTemplates(prev => [data, ...prev]);
    toast.success('Template created');
  };

  const updateTemplate = async (id, fields) => {
    const { data } = await api.put(`/report-templates/${id}`, fields);
    setTemplates(prev => prev.map(t => t.id === id ? data : t));
    toast.success('Template updated');
  };

  const setDefault = async (id) => {
    await api.patch(`/report-templates/${id}/default`);
    setTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === id ? 1 : 0 })));
    toast.success('Default template updated');
  };

  const duplicate = async (id) => {
    const { data } = await api.post(`/report-templates/${id}/duplicate`);
    setTemplates(prev => [...prev, data]);
    toast.success('Template duplicated — edit to customise');
  };

  const destroy = async (id) => {
    const tpl = templates.find(t => t.id === id);
    if (tpl?.is_default) return toast.error("Can't delete the default template");
    if (!confirm(`Delete template "${tpl?.name}"?`)) return;
    await api.delete(`/report-templates/${id}`);
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Deleted');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {(showNew || editing) && (
        <TemplateEditorModal
          template={editing}
          onSave={editing ? (f) => updateTemplate(editing.id, f) : createTemplate}
          onClose={() => { setEditing(null); setShowNew(false); }}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Report Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage official report templates for case documentation</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-primary">
          + New Template
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading…</div>
      ) : templates.length === 0 ? (
        <div className="text-center text-gray-400 py-12 card p-8">
          <div className="text-4xl mb-3">📄</div>
          <p className="font-medium">No templates yet</p>
          <p className="text-sm mt-1">Create a template that users can use when writing official reports</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="card p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{t.name}</span>
                  {t.is_default ? (
                    <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                      ★ Default
                    </span>
                  ) : null}
                </div>
                {t.description && <p className="text-sm text-gray-500 mt-0.5">{t.description}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  Created by {t.created_by_name || 'Unknown'} · {new Date(t.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                {!t.is_default && (
                  <button
                    onClick={() => setDefault(t.id)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    title="Set as default"
                  >
                    Set Default
                  </button>
                )}
                <button
                  onClick={() => duplicate(t.id)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => setEditing(t)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  Edit
                </button>
                {!t.is_default && (
                  <button
                    onClick={() => destroy(t.id)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
