import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import toast from 'react-hot-toast';
import SignatureBlock from '../components/SignatureBlock';

export default function ExportPreview() {
  const { id } = useParams();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleDownload = async (format) => {
    try {
      const res = await api.get(`/cases/${id}/export/${format}`, { responseType: 'blob' });
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `${id}-report.${format}`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(`Failed to download ${format.toUpperCase()}`);
    }
  };

  useEffect(() => {
    api.get(`/cases/${id}`)
      .then(r => setCaseData(r.data))
      .catch(() => toast.error('Failed to load case'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading preview…</div>;
  if (!caseData) return <div className="p-8 text-center text-red-500">Case not found</div>;

  const date = caseData.incident_date
    ? new Date(caseData.incident_date).toLocaleDateString('sw-TZ', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Print toolbar */}
      <div className="print:hidden bg-brand-900 text-white px-6 py-3 flex items-center gap-4">
        <Link to={`/cases/${id}`} className="text-white/70 hover:text-white text-sm flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Case
        </Link>
        <span className="text-white/30">|</span>
        <span className="text-sm font-medium">{id} — Export Preview</span>
        <div className="ml-auto flex gap-3">
          <button onClick={() => handleDownload('pdf')}
            className="btn-primary text-sm py-1.5">
            Download PDF
          </button>
          <button onClick={() => handleDownload('docx')}
            className="btn-secondary text-sm py-1.5">
            Download Word
          </button>
          <button onClick={() => window.print()} className="btn-ghost text-white text-sm py-1.5">
            Print
          </button>
        </div>
      </div>

      {/* A4 preview area */}
      <div className="max-w-4xl mx-auto my-6 print:my-0">
        <div className="bg-white shadow-lg print:shadow-none p-12 print:p-8" id="preview-content">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-sm font-bold tracking-widest uppercase text-gray-500 mb-1">
              OLAM TECHNOLOGIES — HELION TRACKING
            </div>
            <div className="border-t-2 border-gray-800 my-3" />
            <h1 className="text-xl font-bold uppercase tracking-wide text-gray-900">
              TAARIFA RASMI YA TUKIO
            </h1>
            <h2 className="text-sm text-gray-500 mt-0.5">INCIDENT REPORT</h2>
            <div className="border-t border-gray-300 mt-3" />
          </div>

          <h2 className="text-base font-bold text-center text-gray-800 mb-5 italic">{caseData.title}</h2>

          {/* Metadata table */}
          <table className="w-full text-sm mb-6 border border-gray-300">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="bg-gray-50 px-3 py-2 font-semibold w-1/4">Case ID</td>
                <td className="px-3 py-2 font-mono">{caseData.id}</td>
                <td className="bg-gray-50 px-3 py-2 font-semibold w-1/4">Tarehe / Date</td>
                <td className="px-3 py-2">{date}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="bg-gray-50 px-3 py-2 font-semibold">Gari / Vehicle</td>
                <td className="px-3 py-2 font-mono">{caseData.vehicle_plate || '—'}</td>
                <td className="bg-gray-50 px-3 py-2 font-semibold">Hali / Status</td>
                <td className="px-3 py-2 uppercase font-semibold">{caseData.status}</td>
              </tr>
              <tr>
                <td className="bg-gray-50 px-3 py-2 font-semibold">Dereva / Driver</td>
                <td className="px-3 py-2">{caseData.driver_name || '—'}</td>
                <td className="bg-gray-50 px-3 py-2 font-semibold">Ukali / Severity</td>
                <td className="px-3 py-2 uppercase font-semibold">{caseData.severity}</td>
              </tr>
            </tbody>
          </table>

          <div className="border-t border-gray-300 mb-6" />

          {/* Steps */}
          <div className="space-y-5">
            {(caseData.steps || []).map((step, i) => (
              <div key={step.id}>
                {step.type === 'text' && (
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">{step.label}</h3>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{step.content}</p>
                  </div>
                )}
                {step.type === 'evidence' && (
                  <div className="border border-gray-300 rounded bg-gray-50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                        USHAHIDI / EVIDENCE
                      </span>
                      <span className="font-semibold text-sm text-gray-800">{step.label}</span>
                    </div>
                    {(step.files || []).length === 0 && (
                      <p className="text-xs text-gray-400 italic">No files attached</p>
                    )}
                    <div className="space-y-2">
                      {(step.files || []).map(f => (
                        <div key={f.id}>
                          {f.file_type === 'image' && (
                            <img
                              src={`/uploads/steps/${f.step_id}/${f.file_path.split('/').pop()}`}
                              alt={f.file_name}
                              className="max-w-full max-h-80 rounded border border-gray-200"
                            />
                          )}
                          {f.file_type === 'video' && (
                            <video controls className="max-w-full max-h-64 rounded">
                              <source src={`/uploads/steps/${f.step_id}/${f.file_path.split('/').pop()}`} type={f.mime_type} />
                            </video>
                          )}
                          {(f.file_type === 'document' || f.file_type === 'audio') && (
                            <p className="text-sm text-gray-600">📄 {f.file_name} ({(f.file_size / 1024).toFixed(0)} KB)</p>
                          )}
                        </div>
                      ))}
                    </div>
                    {step.note && (
                      <p className="text-xs text-gray-500 italic mt-2">{step.note}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <SignatureBlock />
        </div>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
