import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function HearingBanner() {
  const { isAuthenticated } = useAuth();
  const [hearings, setHearings] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { setHearings([]); setDismissed(false); return; }
    // Reset dismissed on each new login session
    const key = `hearing_dismissed_${Date.now().toString().slice(0, 8)}`;
    // Use sessionStorage so it resets on every new browser session / login
    const sessionKey = 'hearing_banner_dismissed';
    if (sessionStorage.getItem(sessionKey)) { setDismissed(true); }
    api.get('/cases/hearings/upcoming').then(r => setHearings(r.data)).catch(() => {});
  }, [isAuthenticated]);

  if (!isAuthenticated || dismissed || hearings.length === 0) return null;

  const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

  const daysUntil = (d) => {
    const diff = new Date(d) - new Date(new Date().toDateString());
    return Math.round(diff / 86400000);
  };

  const dismiss = () => {
    sessionStorage.setItem('hearing_banner_dismissed', '1');
    setDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-amber-500 px-6 py-4 flex items-center gap-3">
          <svg className="w-6 h-6 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h2 className="text-white font-bold text-base">Upcoming Hearing{hearings.length > 1 ? 's' : ''}</h2>
          <button onClick={dismiss} className="ml-auto text-white/80 hover:text-white" aria-label="Dismiss">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3 max-h-80 overflow-y-auto">
          {hearings.map(h => {
            const days = daysUntil(h.hearing_date);
            return (
              <div key={h.id} className="border border-amber-100 rounded-xl p-3 bg-amber-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/cases/${h.id}`} onClick={dismiss} className="text-sm font-semibold text-gray-800 hover:text-amber-700 hover:underline truncate block">
                      {h.id} — {h.title}
                    </Link>
                    {h.vehicle_plate && <div className="text-xs text-gray-500 mt-0.5">Vehicle: {h.vehicle_plate}</div>}
                    {h.hearing_notes && <div className="text-xs text-gray-500 mt-1 leading-relaxed">{h.hearing_notes}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-bold text-amber-700">{fmt(h.hearing_date)}</div>
                    <div className={`text-xs mt-0.5 font-medium ${days === 0 ? 'text-red-600' : days === 1 ? 'text-orange-600' : 'text-amber-600'}`}>
                      {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `In ${days} days`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={dismiss} className="btn btn-primary text-sm">OK, got it</button>
        </div>
      </div>
    </div>
  );
}
