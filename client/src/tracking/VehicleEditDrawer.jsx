import { useTheme } from "./theme.jsx";
import { Btn, Inp } from "./ui/primitives.jsx";
import CameraEditor from "./CameraEditor.jsx";

export default function VehicleEditDrawer({
  selected,
  bundleDraft,
  setBundleDraft,
  bundleDurationDraft,
  setBundleDurationDraft,
  simPhoneDraft,
  setSimPhoneDraft,
  vehicleCommentDraft,
  setVehicleCommentDraft,
  driverPhoneDraft,
  setDriverPhoneDraft,
  driverCommentDraft,
  setDriverCommentDraft,
  cameraDraft,
  setCameraDraft,
  noteDraft,
  setNoteDraft,
  newNote,
  setNewNote,
  manualHistory,
  saving,
  onSave,
  onAddNote,
  onClose,
  fmtTs,
  fmtDay,
}) {
  const { t } = useTheme();
  if (!selected) return null;

  const daysLeft = selected.bundleDaysLeft;
  const bundleLow = selected.bundleLow;

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.35)",
          zIndex: 1000,
        }}
      />
      <div
        role="dialog"
        aria-label={`Edit ${selected.plate}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "min(420px, 92vw)",
          height: "100vh",
          background: t.panel,
          boxShadow: "-8px 0 32px rgba(0,0,0,0.2)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${t.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: t.panelBright,
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{selected.plate}</div>
            <div style={{ fontSize: 11, color: t.textSoft }}>{selected.devIdno}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close panel"
            style={{
              border: "none",
              background: t.bg,
              borderRadius: 8,
              width: 36,
              height: 36,
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
              color: t.text,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            scrollBehavior: "smooth",
          }}
        >
          <Inp
            label="SIM / phone number"
            value={simPhoneDraft}
            onChange={(e) => setSimPhoneDraft(e.target.value)}
            placeholder="e.g. 255300020357668"
          />

          <Inp
            label="Plate highlight (short tag)"
            value={vehicleCommentDraft}
            onChange={(e) => setVehicleCommentDraft(e.target.value)}
            placeholder="e.g. excavator, mtwara, Canter…"
          />
          <div style={{ fontSize: 10, color: t.textSoft, marginTop: -4, marginBottom: 8 }}>
            Shown as a yellow badge under the plate in the fleet table.
          </div>

          <div style={{ marginTop: 12 }}>
            <Inp
              label="Driver phone"
              value={driverPhoneDraft}
              onChange={(e) => setDriverPhoneDraft(e.target.value)}
              placeholder="255… or 07…"
            />
            <Inp
              label="Driver name / note"
              value={driverCommentDraft}
              onChange={(e) => setDriverCommentDraft(e.target.value)}
              placeholder="Driver name shown under driver phone"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <Inp
              label="Data bundle purchased (start date)"
              type="date"
              value={bundleDraft}
              onChange={(e) => setBundleDraft(e.target.value)}
            />
            <Inp
              label="Bundle valid for (days until next payment)"
              type="number"
              min={1}
              value={bundleDurationDraft}
              onChange={(e) => setBundleDurationDraft(e.target.value)}
              placeholder="e.g. 30"
            />
            {daysLeft != null && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  background: bundleLow ? "#fecaca" : "#dcfce7",
                  color: bundleLow ? "#991b1b" : "#166534",
                }}
              >
                {daysLeft <= 0
                  ? "Bundle expired or due today"
                  : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
                {selected.bundleEndsOn ? (
                  <span style={{ fontWeight: 500, marginLeft: 6 }}>
                    (ends {fmtDay(selected.bundleEndsOn)})
                  </span>
                ) : null}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, fontSize: 11, color: t.textSoft, lineHeight: 1.45 }}>
            {selected.autoNotes}
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Cameras (1–6)</div>
            {selected.camerasEditedBy ? (
              <div style={{ fontSize: 10, color: t.textSoft, marginBottom: 8 }}>
                Last camera edit: <strong>{selected.camerasEditedBy}</strong>
                {selected.camerasEditedAt ? ` · ${fmtTs(selected.camerasEditedAt)}` : ""}
              </div>
            ) : null}
            <CameraEditor value={cameraDraft} onChange={setCameraDraft} disabled={saving} />
          </div>

          {/* ── Background / permanent vehicle notes ── */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
              Background notes (not shown in table)
            </div>
            <div style={{ fontSize: 10, color: t.textSoft, marginBottom: 6 }}>
              Internal notes saved with the vehicle record. Only the latest log entry (below) shows in the fleet table.
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 10,
                border: `1px solid ${t.border}`,
                padding: 10,
                fontFamily: "inherit",
                fontSize: 12,
              }}
            />
          </div>

          <Btn onClick={onSave} disabled={saving} style={{ marginTop: 12, width: "100%" }}>
            {saving ? "Saving…" : "Save vehicle record"}
          </Btn>

          {/* ── Add a note — shows in NOTES column of fleet table ── */}
          <div
            style={{
              marginTop: 20,
              borderTop: `1px solid ${t.border}`,
              paddingTop: 14,
              background: t.accentSoft,
              borderRadius: 10,
              padding: "12px 10px",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2, color: t.accent }}>
              ✏ Add note
            </div>
            <div style={{ fontSize: 10, color: t.textSoft, marginBottom: 8 }}>
              The latest note shows in the NOTES column of the fleet table. Your name is attached automatically.
            </div>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={2}
              placeholder="Type a note and click Add…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                padding: 8,
                fontFamily: "inherit",
                fontSize: 12,
              }}
            />
            <Btn
              onClick={onAddNote}
              disabled={saving || !newNote.trim()}
              style={{ marginTop: 6, width: "100%" }}
            >
              {saving ? "Saving…" : "Add note"}
            </Btn>
          </div>

          {/* ── Note history ── */}
          {manualHistory.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                Note history ({manualHistory.length})
              </div>
              {manualHistory.map((ent, idx) => {
                const isNote = !ent.fields?.type || ent.fields.type === "note" || ent.fields.type === "notes";
                const isLatestNote = isNote && idx === manualHistory.findIndex((e) => !e.fields?.type || e.fields.type === "note" || e.fields.type === "notes");
                return (
                  <div
                    key={ent.id}
                    style={{
                      marginBottom: 8,
                      padding: "8px 10px",
                      background: isLatestNote ? t.accentSoft : t.bg,
                      borderRadius: 8,
                      fontSize: 10,
                      borderLeft: `3px solid ${
                        ent.fields?.type === "cameras" ? t.orange : isLatestNote ? t.accent : t.border
                      }`,
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 3 }}>
                      {isLatestNote && (
                        <span style={{ background: t.accent, color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "1px 5px" }}>
                          LATEST
                        </span>
                      )}
                      <span style={{ fontWeight: 700, color: t.text }}>
                        {ent.fields?.type === "cameras" ? "📷 camera" : "📝 note"}
                      </span>
                      <span style={{ color: t.textSoft }}>{fmtDay(ent.reportDate)}</span>
                      <span style={{ color: t.textSoft }}>{fmtTs(ent.recordedAt)}</span>
                    </div>
                    {ent.createdBy && (
                      <div style={{ fontWeight: 700, color: t.accent, fontSize: 10, marginBottom: 2 }}>
                        👤 {ent.createdBy}
                      </div>
                    )}
                    <div style={{ color: t.text, lineHeight: 1.4 }}>{ent.manualNote || "—"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
