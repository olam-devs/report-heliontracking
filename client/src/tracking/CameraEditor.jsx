import { useTheme } from "./theme.jsx";

const CHANNELS = [1, 2, 3, 4, 5, 6];

export function cameraStatusFromRow(row) {
  if (row?.cameraStatus?.mode) {
    return {
      mode: row.cameraStatus.mode,
      badChannels: [...(row.cameraStatus.badChannels || [])],
    };
  }
  if (row?.camerasOk === true) return { mode: "all_ok", badChannels: [] };
  if (row?.camerasOk === false) {
    return { mode: "issues", badChannels: [...(row.badChannels || [])] };
  }
  return { mode: "unchecked", badChannels: [] };
}

export default function CameraEditor({ value, onChange, disabled }) {
  const { t } = useTheme();
  const mode = value?.mode || "unchecked";
  const bad = new Set(value?.badChannels || []);

  const setMode = (m) => {
    if (m === "all_ok") onChange({ mode: "all_ok", badChannels: [] });
    else if (m === "issues") onChange({ mode: "issues", badChannels: [...bad] });
    else onChange({ mode: "unchecked", badChannels: [] });
  };

  const toggleCam = (n) => {
    const next = new Set(bad);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    onChange({ mode: "issues", badChannels: [...next].sort((a, b) => a - b) });
  };

  const btn = (active, label, onClick) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: `2px solid ${active ? t.accent : t.border}`,
        background: active ? t.accentSoft : t.panel,
        color: active ? t.accent : t.text,
        fontWeight: 700,
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {btn(mode === "all_ok", "All cameras OK (1–6)", () => setMode("all_ok"))}
        {btn(mode === "issues", "Some cameras need maintenance", () => setMode("issues"))}
      </div>
      {mode === "issues" && (
        <div>
          <div style={{ fontSize: 11, color: t.textSoft, marginBottom: 8 }}>
            Select which camera(s) have problems:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CHANNELS.map((n) => {
              const on = bad.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleCam(n)}
                  style={{
                    minWidth: 52,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: `2px solid ${on ? t.red : t.border}`,
                    background: on ? t.redSoft : t.panel,
                    color: on ? t.red : t.text,
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Cam {n}
                </button>
              );
            })}
          </div>
          {bad.size > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: t.red, fontWeight: 600 }}>
              Flagged: Cam {[...bad].sort((a, b) => a - b).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CamCellLabel({ row, t }) {
  const label = row.camerasLabel || "—";
  const ok = row.camerasOk;
  const color = ok === true ? t.green : ok === false ? t.red : t.muted;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color }} title={label}>
      {label}
    </span>
  );
}
