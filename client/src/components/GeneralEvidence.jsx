import { useState, useRef } from 'react';
import api, { downloadFile } from '../api/client';
import toast from 'react-hot-toast';

const FILE_ICONS = { image: '🖼️', video: '🎬', document: '📄', audio: '🔊' };

function GeneralFileCard({ file, onDelete, onDescriptionSaved, readOnly, canDownload }) {
  const [desc, setDesc] = useState(file.description || '');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

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

  const fileName = file.file_path ? file.file_path.split('/').pop() : file.file_name;
  const imgUrl = `/uploads/cases/${file.case_id}/general/${fileName}`;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      {file.file_type === 'image' && (
        <img src={imgUrl} alt={file.file_name} className="w-full h-28 object-cover"
          onError={(e) => { e.target.style.display = 'none'; }} />
      )}
      {(file.file_type !== 'image') && (
        <div className="flex items-center gap-2 p-2 bg-gray-50 border-b border-gray-100">
          <span className="text-2xl">{FILE_ICONS[file.file_type] || '📁'}</span>
          <p className="text-xs font-medium truncate flex-1">{file.file_name}</p>
        </div>
      )}
      {file.file_type === 'image' && (
        <div className="px-2 pt-1">
          <p className="text-xs text-gray-400 truncate">{file.file_name}</p>
        </div>
      )}

      {/* Description area */}
      <div className="px-2 pt-1 pb-1">
        {readOnly ? (
          desc ? (
            <p className="text-xs text-gray-500 italic leading-relaxed">{desc}</p>
          ) : null
        ) : editing ? (
          <div className="space-y-1">
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description…"
              autoFocus
              className="w-full text-xs border border-brand-300 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400 mt-1"
            />
            <div className="flex gap-1">
              <button onClick={saveDesc} disabled={saving} className="text-xs font-medium bg-brand-600 text-white px-2 py-0.5 rounded hover:bg-brand-700">
                {saving ? '…' : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setDesc(file.description || ''); }} className="text-xs text-gray-500 px-2 py-0.5 rounded hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-gray-400 hover:text-gray-600 italic w-full text-left"
            title="Click to edit description"
          >
            {desc || <span className="hover:underline">+ Add description…</span>}
          </button>
        )}
      </div>

      <div className="flex gap-1.5 px-2 pb-2 pt-1">
        {canDownload && (
          <button
            onClick={async () => {
              try { await downloadFile(`/evidence/${file.id}/download`, file.file_name); }
              catch { toast.error('Download failed'); }
            }}
            className="flex-1 text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white rounded px-2 py-1 transition-colors"
          >
            Download
          </button>
        )}
        {!readOnly && (
          <button onClick={() => onDelete(file.id)}
            className="text-xs font-medium border border-red-200 text-red-500 hover:bg-red-50 rounded px-2 py-1 transition-colors">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          General Evidence
        </h2>
        {!readOnly && <span className="text-xs text-gray-400 ml-auto">Appears at end of report</span>}
      </div>

      {files.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
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
      ) : readOnly ? (
        <p className="text-sm text-gray-400 italic">No evidence files attached.</p>
      ) : null}

      {!readOnly && (
        <>
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
              ${uploading ? 'border-purple-300 bg-purple-50' : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              fileRef.current.files = e.dataTransfer.files;
              await handleUpload({ target: fileRef.current });
            }}
          >
            {uploading ? (
              <p className="text-sm text-purple-600">Uploading…</p>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  <span className="text-purple-600 font-medium">Click to upload</span> or drag & drop
                </p>
                <p className="text-xs text-gray-400 mt-0.5">General evidence not tied to a specific step</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" multiple className="hidden"
            accept=".jpg,.jpeg,.png,.gif,.mp4,.mov,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleUpload} />
        </>
      )}
    </div>
  );
}
