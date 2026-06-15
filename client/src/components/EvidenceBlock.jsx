import { useState, useRef } from 'react';
import api, { downloadFile } from '../api/client';
import toast from 'react-hot-toast';

const FILE_ICONS = {
  image: '🖼️', video: '🎬', document: '📄', audio: '🔊',
};

function FilePreview({ file, onDelete, onDescriptionSaved, readOnly, canDownload }) {
  const [desc, setDesc] = useState(file.description || '');
  const [saving, setSaving] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const url = `/uploads/steps/${file.step_id}/${file.file_path.split('/').pop()}`;

  const saveDescription = async () => {
    if (desc === (file.description || '')) { setEditingDesc(false); return; }
    setSaving(true);
    try {
      const { data } = await api.patch(`/evidence/${file.id}`, { description: desc });
      onDescriptionSaved(data);
      setEditingDesc(false);
    } catch {
      toast.error('Failed to save description');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Preview area */}
      {file.file_type === 'image' && (
        <img src={url} alt={file.file_name} className="w-full h-36 object-cover"
          onError={(e) => { e.target.style.display = 'none'; }} />
      )}
      {file.file_type === 'video' && (
        <video controls className="w-full h-36 object-cover bg-black">
          <source src={url} type={file.mime_type} />
        </video>
      )}
      {(file.file_type === 'document' || file.file_type === 'audio') && (
        <div className="flex items-center gap-3 p-3 bg-gray-50 border-b border-gray-100">
          <span className="text-3xl">{FILE_ICONS[file.file_type]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{file.file_name}</p>
            <p className="text-xs text-gray-400">{(file.file_size / 1024).toFixed(1)} KB</p>
          </div>
        </div>
      )}

      {/* File name row */}
      <div className="px-3 pt-2 pb-1">
        <p className="text-xs text-gray-500 truncate">{file.file_name}</p>
      </div>

      {/* Description */}
      <div className="px-3 pb-2">
        {readOnly ? (
          desc
            ? <p className="text-xs text-gray-500 italic leading-relaxed">{desc}</p>
            : null
        ) : editingDesc ? (
          <div className="space-y-1">
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              autoFocus
              placeholder="Add a description for this evidence…"
              className="w-full text-xs border border-brand-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <div className="flex gap-1">
              <button onClick={saveDescription} disabled={saving}
                className="text-xs font-medium bg-brand-600 text-white px-2 py-0.5 rounded hover:bg-brand-700">
                {saving ? '…' : 'Save'}
              </button>
              <button onClick={() => { setEditingDesc(false); setDesc(file.description || ''); }}
                className="text-xs text-gray-500 px-2 py-0.5 rounded hover:bg-gray-100">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditingDesc(true)}
            className="text-xs text-gray-400 hover:text-gray-600 italic w-full text-left">
            {desc || <span className="hover:underline">+ Add description…</span>}
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-3 pb-3">
        {canDownload && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try { await downloadFile(`/evidence/${file.id}/download`, file.file_name); }
              catch { toast.error('Download failed'); }
            }}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
        )}
        {!readOnly && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(file.id); }}
            className="flex items-center justify-center gap-1 text-xs font-medium border border-red-200 text-red-500 hover:bg-red-50 rounded px-2.5 py-1.5 transition-colors"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function EvidenceBlock({ step, onChange, readOnly = false, canDownload = true }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post(`/steps/${step.id}/evidence`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        onChange({ ...step, files: [...(step.files || []), data] });
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
      onChange({ ...step, files: step.files.filter(f => f.id !== fileId) });
      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete file');
    }
  };

  const handleDescriptionSaved = (updatedFile) => {
    onChange({ ...step, files: step.files.map(f => f.id === updatedFile.id ? updatedFile : f) });
  };

  const files = step.files || [];

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map(f => (
            <FilePreview
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

      {/* Upload zone — only when not read-only */}
      {!readOnly && (
        <>
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer
              ${uploading ? 'border-brand-300 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              fileRef.current.files = e.dataTransfer.files;
              await handleUpload({ target: fileRef.current });
            }}
          >
            {uploading ? (
              <p className="text-sm text-brand-600">Uploading…</p>
            ) : (
              <>
                <svg className="w-6 h-6 mx-auto text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-gray-500">
                  <span className="text-brand-600 font-medium">Click to upload</span> or drag & drop
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Images, videos, PDFs, Word, Excel — up to 50MB</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" multiple className="hidden"
            accept=".jpg,.jpeg,.png,.gif,.mp4,.mov,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleUpload} />
        </>
      )}

      {/* Read-only empty state */}
      {readOnly && files.length === 0 && (
        <p className="text-xs text-gray-400 italic">No evidence files attached to this step.</p>
      )}
    </div>
  );
}
