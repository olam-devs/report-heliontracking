import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { downloadFile } from '../api/client';
import toast from 'react-hot-toast';
import TipTapEditor from '../components/TipTapEditor';
import { useAuth } from '../context/AuthContext';

function TemplateSelectModal({ templates, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Select Report Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-brand-500 hover:bg-brand-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{t.name}</span>
                {t.is_default ? (
                  <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">Default</span>
                ) : null}
              </div>
              {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
            </button>
          ))}
          <button
            onClick={() => onSelect(null)}
            className="w-full text-left px-4 py-3 rounded-lg border border-dashed border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-700 text-sm transition-colors"
          >
            Start with blank document
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReportEditor() {
  const { id: caseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [report, setReport] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [caseTitle, setCaseTitle] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const contentRef = useRef('');
  const autoSaveRef = useRef(null);

  const canEdit = user?.role === 'admin' || !!user?.can_edit_reports;

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [caseRes, tmplRes] = await Promise.all([
          api.get(`/cases/${caseId}`),
          api.get('/report-templates'),
        ]);
        setCaseTitle(caseRes.data.title || caseId);
        setTemplates(tmplRes.data);

        try {
          const reportRes = await api.get(`/cases/${caseId}/report`);
          setReport(reportRes.data);
          setContent(reportRes.data.content || '');
          contentRef.current = reportRes.data.content || '';
        } catch (err) {
          if (err.response?.status === 404) {
            // No report exists yet
            setReport(null);
          } else if (err.response?.status === 403) {
            toast.error('Report not published yet');
            navigate(`/cases/${caseId}`);
          } else {
            throw err;
          }
        }
      } catch {
        toast.error('Failed to load');
        navigate(`/cases/${caseId}`);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [caseId]);

  // Auto-save every 30 seconds if dirty
  useEffect(() => {
    if (!report || !canEdit) return;
    autoSaveRef.current = setInterval(async () => {
      if (contentRef.current === (report?.content || '')) return;
      try {
        await api.put(`/cases/${caseId}/report`, { content: contentRef.current });
        setLastSaved(new Date());
      } catch {}
    }, 30000);
    return () => clearInterval(autoSaveRef.current);
  }, [report, canEdit, caseId]);

  const handleContentChange = useCallback((html) => {
    setContent(html);
    contentRef.current = html;
  }, []);

  const createReport = async (templateId) => {
    setShowTemplateModal(false);
    try {
      const body = templateId ? { template_id: templateId } : {};
      const { data } = await api.post(`/cases/${caseId}/report`, body);
      setReport(data);
      setContent(data.content || '');
      contentRef.current = data.content || '';
      toast.success('Report created');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create report');
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      await api.put(`/cases/${caseId}/report`, { content });
      setReport(r => ({ ...r, content }));
      setLastSaved(new Date());
      toast.success('Draft saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!confirm('Publish this report? All users with case access will be able to see and download it.')) return;
    setSaving(true);
    try {
      await api.patch(`/cases/${caseId}/report/publish`, { content });
      setReport(r => ({ ...r, status: 'published', content }));
      toast.success('Report published!');
    } catch {
      toast.error('Publish failed');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    try {
      await downloadFile(`/cases/${caseId}/report/pdf`, `OfficialReport-${caseId}.pdf`);
    } catch {
      toast.error('Download failed');
    }
  };

  const previewPdf = async () => {
    setPreviewLoading(true);
    try {
      if (canEdit && contentRef.current !== (report?.content || '')) {
        await api.put(`/cases/${caseId}/report`, { content: contentRef.current });
      }
      const response = await api.get(`/cases/${caseId}/report/pdf?inline=1`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setShowPreview(true);
    } catch {
      toast.error('Preview failed — save draft and try again');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setShowPreview(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-screen bg-gray-50">
      <div className="text-gray-500">Loading report…</div>
    </div>
  );

  // No report yet — show create UI
  if (!report) {
    if (!canEdit) return (
      <div className="flex flex-col items-center justify-center h-full min-h-screen bg-gray-50 gap-4">
        <div className="text-gray-500">No official report has been created for this case yet.</div>
        <Link to={`/cases/${caseId}`} className="btn btn-secondary">← Back to case</Link>
      </div>
    );
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-6">
        {showTemplateModal && (
          <TemplateSelectModal
            templates={templates}
            onSelect={createReport}
            onClose={() => setShowTemplateModal(false)}
          />
        )}
        <div className="text-center">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">No Official Report Yet</h2>
          <p className="text-gray-500 text-sm mb-6">Create an official report for <strong>{caseTitle}</strong></p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setShowTemplateModal(true)} className="btn btn-primary">
              Create Official Report
            </button>
            <Link to={`/cases/${caseId}`} className="btn btn-secondary">Cancel</Link>
          </div>
        </div>
      </div>
    );
  }

  const isPublished = report.status === 'published';

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shrink-0">
        <Link to={`/cases/${caseId}`} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-700">Official Report — </span>
          <span className="font-mono text-sm font-bold text-brand-600">{caseId}</span>
          {caseTitle && <span className="text-sm text-gray-500 ml-1">· {caseTitle}</span>}
        </div>

        {/* Status pill */}
        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
          isPublished ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {isPublished ? 'Published' : 'Draft'}
        </span>

        {lastSaved && (
          <span className="text-xs text-gray-400 hidden sm:block">
            Saved {lastSaved.toLocaleTimeString()}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={previewPdf}
            disabled={previewLoading || saving}
            className="btn btn-secondary text-xs py-1.5"
          >
            {previewLoading ? '…' : '👁 Preview PDF'}
          </button>
          {isPublished && (
            <button onClick={downloadPdf} className="btn btn-secondary text-xs py-1.5">
              ⬇ Download PDF
            </button>
          )}
          {canEdit && (
            <>
              <button onClick={saveDraft} disabled={saving} className="btn btn-secondary text-xs py-1.5">
                {saving ? 'Saving…' : '💾 Save Draft'}
              </button>
              <button onClick={publish} disabled={saving} className="btn btn-primary text-xs py-1.5">
                {saving ? '…' : isPublished ? '🔄 Re-publish' : '🚀 Publish'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Published banner for read-only viewers */}
      {isPublished && !canEdit && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-2 flex items-center justify-between">
          <span className="text-sm text-green-700">
            Published on {new Date(report.published_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
            {report.published_by_name && ` by ${report.published_by_name}`}
          </span>
          <button onClick={downloadPdf} className="btn btn-secondary text-xs py-1">
            ⬇ Download PDF
          </button>
        </div>
      )}

      {/* PDF preview modal */}
      {showPreview && previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
            <span className="text-sm font-medium text-gray-700">PDF preview (same as download)</span>
            <div className="flex gap-2">
              <button type="button" onClick={downloadPdf} className="btn btn-secondary text-xs py-1">
                Download
              </button>
              <button type="button" onClick={closePreview} className="btn btn-primary text-xs py-1">
                Close
              </button>
            </div>
          </div>
          <iframe title="Report PDF preview" src={previewUrl} className="flex-1 w-full bg-gray-100" />
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-auto">
        <TipTapEditor
          content={content}
          onChange={handleContentChange}
          editable={canEdit}
          paginated={true}
        />
      </div>
    </div>
  );
}
