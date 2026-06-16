import { useState, useRef } from 'react';
import api, { downloadFile } from '../api/client';
import toast from 'react-hot-toast';

const FILE_ICONS = { image: '🖼️', video: '🎬', document: '📄', audio: '🔊' };

// ── Preview Modal ─────────────────────────────────────────────────────────────

function PreviewModal({ file, url, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxWidth: '90vw', maxHeight: '90vh', minWidth: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50 shrink-0">
          <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{file.file_name}</span>
          <button onClick={onClose} className="ml-4 text-gray-400 hover:text-gray-700 text-lg leading-none shrink-0">✕</button>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-100" style={{ minHeight: 300 }}>
          {file.file_type === 'image' && (
            <img src={url} alt={file.file_name} className="max-w-full max-h-[75vh] object-contain" />
          )}
          {file.file_type === 'video' && (
            <video controls autoPlay className="max-w-full max-h-[75vh] bg-black" style={{ maxWidth: '80vw' }}>
              <source src={url} type={file.mime_type} />
            </video>
          )}
          {file.file_type === 'document' && file.mime_type === 'application/pdf' && (
            <iframe src={`${url}#toolbar=1&view=FitH`} title={file.file_name}
              className="w-full border-0" style={{ height: '75vh', minWidth: '60vw' }} />
          )}
          {file.file_type === 'document' && file.mime_type !== 'application/pdf' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 px-8 text-center">
              <span className="text-5xl">📄</span>
              <p className="text-sm font-medium text-gray-700">{file.file_name}</p>
              <p className="text-xs text-gray-400">Word and Excel files cannot be previewed in the browser.</p>
              <p className="text-xs text-gray-400">Download the file to view it.</p>
            </div>
          )}
          {file.file_type === 'audio' && (
            <div className="p-8">
              <audio controls src={url} className="w-full min-w-[300px]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── File Card ─────────────────────────────────────────────────────────────────

function GeneralFileCard({ file, onDelete, onDescriptionSaved, readOnly, canDownload }) {
  const [desc, setDesc] = useState(file.description || '');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const fileName = file.file_path ? file.file_path.split('/').pop() : file.file_name;
  const url = `/uploads/cases/${file.case_id}/general/${fileName}`;

  const canPreview =
    file.file_type === 'image' ||
    file.file_type === 'video' ||
    file.file_type === 'audio' ||
    (file.file_type === 'document' && file.mime_type === 'application/pdf');

  const saveDesc = async () => {
    if (desc === (file.description || '')) { setEditing(false); return; }
    setSaving(true);
    try {
      const { data } = await api.patch(`/evidence/${file.id}`, { description: desc });
      onDescriptionSaved(data);
      setEditing(false);
    } catch {
      toast.error('Failed to save description');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {previewing && <PreviewModal file={file} url={url} onClose={() => setPreviewing(false)} />}

      <div className="flex items-start gap-2.5 border border-gray-200 rounded-lg p-2.5 bg-white hover:bg-gray-50 transition-colors group">
        {/* Thumbnail / Icon */}
        <div
          className={`shrink-0 w-12 h-12 rounded-md overflow-hidden border border-gray-100 flex items-center justify-center bg-gray-50 ${canPreview ? 'cursor-pointer' : ''}`}
          onClick={() => canPreview && setPreviewing(true)}
        >
          {file.file_type === 'image' ? (
            <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
          ) : (
            <span className="text-xl">{FILE_ICONS[file.file_type] || '📎'}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs font-medium text-gray-800 truncate leading-snug ${canPreview ? 'cursor-pointer hover:text-brand-600' : ''}`}
            onClick={() => canPreview && setPreviewing(true)}
            title={file.file_name}
          >
            {file.file_name}
          </p>
          <p className="text-[10px] text-gray-400 mb-1">{(file.file_size / 1024).toFixed(1)} KB</p>

          {readOnly ? (
            desc ? <p className="text-[11px] text-gray-500 italic">{desc}</p> : null
          ) : editing ? (
            <div className="space-y-1 mt-1">
              <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} autoFocus
                placeholder="Description…"
                className="w-full text-xs border border-brand-300 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400" />
              <div className="flex gap-1">
                <button onClick={saveDesc} disabled={saving}
                  className="text-xs font-medium bg-brand-600 text-white px-2 py-0.5 rounded hover:bg-brand-700">
                  {saving ? '…' : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setDesc(file.description || ''); }}
                  className="text-xs text-gray-500 px-2 py-0.5 rounded hover:bg-gray-100">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="text-[11px] text-gray-400 hover:text-gray-600 italic text-left">
              {desc || <span className="hover:underline">+ description</span>}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canPreview && (
            <button onClick={() => setPreviewing(true)}
              className="text-[10px] font-medium text-brand-600 hover:text-brand-800 border border-brand-200 hover:border-brand-400 rounded px-2 py-0.5">
              Preview
            </button>
          )}
          {canDownload && (
            <button
              onClick={async () => {
                try { await downloadFile(`/evidence/${file.id}/download`, file.file_name); }
                catch { toast.error('Download failed'); }
              }}
              className="text-[10px] font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 rounded px-2 py-0.5">
              ↓ Save
            </button>
          )}
          {!readOnly && (
            <button onClick={() => { if (confirm('Delete this file?')) onDelete(file.id); }}
              className="text-[10px] font-medium text-red-500 hover:text-red-700 border border-red-100 hover:border-red-300 rounded px-2 py-0.5">
              Delete
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function GeneralEvidence({ caseId, files, setFiles, readOnly = false, canDownload = true }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleUpload = async (e) => {
    const selected = Array.from(e.target.files);
    if (!selected.length) return;
    setUploading(true);
    try {
      for (const file of selected) {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post(`/cases/${caseId}/evidence`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setFiles(prev => [...prev, data]);
        toast.success(`Uploaded: ${file.name}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (fileId) => {
    if (!confirm('Delete this file?')) return;
    try {
      await api.delete(`/evidence/${fileId}`);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete file');
    }
  };

  const handleDescriptionSaved = (updated) => {
    setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">General Evidence</h2>
        {!readOnly && <span className="text-xs text-gray-400 ml-auto">Appears at end of report</span>}
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {files.map(f => (
            <GeneralFileCard
              key={f.id}
              file={f}
              onDelete={handleDelete}
              onDescriptionSaved={handleDescriptionSaved}
              readOnly={readOnly}
              canDownload={canDownload}
            />
          ))}
        </div>
      )}

      {readOnly && files.length === 0 && (
        <p className="text-sm text-gray-400 italic">No evidence files attached.</p>
      )}

      {!readOnly && (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-purple-600 border border-dashed border-gray-300 hover:border-purple-400 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading…
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                Attach general evidence
                <span className="text-gray-400">· not tied to a specific step</span>
              </>
            )}
          </button>
          <input ref={fileRef} type="file" multiple className="hidden"
            accept=".jpg,.jpeg,.png,.gif,.mp4,.mov,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleUpload} />
        </>
      )}
    </div>
  );
}
