/** Manual camera checks — channels 1–6 (Helion daily report). */

const CAM_CHANNELS = [1, 2, 3, 4, 5, 6];

function normalizeCameraStatus(input = {}) {
  if (input?.mode === 'all_ok') {
    return { mode: 'all_ok', badChannels: [] };
  }
  if (input?.mode === 'issues') {
    const bad = [...new Set((input.badChannels || []).map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= 6))].sort(
      (a, b) => a - b,
    );
    return { mode: 'issues', badChannels: bad };
  }
  if (input?.mode === 'unchecked') {
    return { mode: 'unchecked', badChannels: [] };
  }
  if (input?.camerasOk === true) return { mode: 'all_ok', badChannels: [] };
  if (input?.camerasOk === false) {
    const bad = [...new Set((input.badChannels || []).map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= 6))].sort(
      (a, b) => a - b,
    );
    return { mode: 'issues', badChannels: bad };
  }
  return { mode: 'unchecked', badChannels: [] };
}

function deriveCamerasOk(status) {
  const st = normalizeCameraStatus(status);
  if (st.mode === 'all_ok') return true;
  if (st.mode === 'issues') return false;
  return null;
}

function toSummary(status) {
  const st = normalizeCameraStatus(status);
  if (st.mode === 'all_ok') return { label: 'All OK', ok: true, status: st };
  if (st.mode === 'issues' && st.badChannels.length) {
    return {
      label: `Cam ${st.badChannels.join(', ')}`,
      ok: false,
      status: st,
    };
  }
  if (st.mode === 'issues') return { label: 'Issue', ok: false, status: st };
  return { label: '—', ok: null, status: st };
}

function toNote(status) {
  const st = normalizeCameraStatus(status);
  if (st.mode === 'all_ok') return 'All cameras OK (1–6)';
  if (st.mode === 'issues' && st.badChannels.length) {
    return `Camera maintenance: Cam ${st.badChannels.join(', ')}`;
  }
  if (st.mode === 'issues') return 'Camera issue (unspecified channel)';
  return '';
}

module.exports = {
  CAM_CHANNELS,
  normalizeCameraStatus,
  deriveCamerasOk,
  toSummary,
  toNote,
};
