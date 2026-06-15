import { useTheme } from "./theme.jsx";
import { Panel, Inp, Sel, Btn } from "./ui/primitives.jsx";

const FUEL_DROP_FILTER = [5, 10, 20, 30, 50];

function HitLists({ fuelDropHits, gprsGapHits, t, maxHeight, fill }) {
  const scroll = {
    maxHeight: fill ? undefined : maxHeight,
    flex: fill ? 1 : undefined,
    minHeight: fill ? 0 : undefined,
    overflowY: "auto",
    fontSize: 11,
    scrollBehavior: "smooth",
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        height: fill ? "100%" : undefined,
        minHeight: fill ? 0 : undefined,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", minHeight: fill ? 0 : undefined }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Fuel drops ({fuelDropHits.length})</div>
        <div style={scroll}>
          {fuelDropHits.length === 0 ? (
            <div style={{ color: t.muted }}>None — run fuel analysis</div>
          ) : (
            fuelDropHits.map((h, i) => (
              <div key={`f-${h.devIdno}-${i}`} style={{ marginBottom: 6, padding: 6, background: t.bg, borderRadius: 6 }}>
                <strong>{h.plate}</strong> −{h.litres}L at {h.at}
                {h.minutesSincePrevDrop != null && (
                  <span style={{ color: t.textSoft }}> ({h.minutesSincePrevDrop}m after prev)</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", minHeight: fill ? 0 : undefined }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>GPS gaps / stale ({gprsGapHits.length})</div>
        <div style={scroll}>
          {gprsGapHits.length === 0 ? (
            <div style={{ color: t.muted }}>None — run GPS analysis</div>
          ) : (
            gprsGapHits.map((h, i) => (
              <div key={`g-${h.devIdno}-${i}`} style={{ marginBottom: 6, padding: 6, background: t.bg, borderRadius: 6 }}>
                <strong>{h.plate}</strong> {h.durationLabel}
                <div style={{ color: t.textSoft }}>
                  {h.from?.slice(0, 16)} → {h.to?.slice(0, 16) || "—"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * view: closed | minimized | normal | expanded
 */
export default function AnalyticsPanel({
  view,
  onViewChange,
  periodLabel,
  beginTs,
  setBeginTs,
  endTs,
  setEndTs,
  fuelDropMinL,
  setFuelDropMinL,
  customFuelMin,
  setCustomFuelMin,
  gprsGapMin,
  setGprsGapMin,
  fuelDropHits,
  gprsGapHits,
  analyticsLoading,
  onRunFuel,
  onRunGprs,
  onRunBoth,
}) {
  const { t } = useTheme();
  if (view === "closed") return null;

  const controls = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
      <Inp
        label="From (date/time)"
        type="datetime-local"
        value={beginTs}
        onChange={(e) => setBeginTs(e.target.value)}
        style={{ width: 210 }}
      />
      <Inp
        label="To (date/time)"
        type="datetime-local"
        value={endTs}
        onChange={(e) => setEndTs(e.target.value)}
        style={{ width: 210 }}
      />
      <Sel
        label="Min fuel drop (L)"
        value={String(fuelDropMinL)}
        onChange={(e) => setFuelDropMinL(Number(e.target.value))}
        options={FUEL_DROP_FILTER.map((n) => ({ value: String(n), label: `${n} L` }))}
      />
      <Inp
        label="Custom min (L)"
        value={customFuelMin}
        onChange={(e) => setCustomFuelMin(e.target.value)}
        placeholder="e.g. 35"
        style={{ width: 90 }}
      />
      <Inp
        label="Min GPS gap (min)"
        value={String(gprsGapMin)}
        onChange={(e) => setGprsGapMin(Number(e.target.value) || 30)}
        type="number"
        style={{ width: 100 }}
      />
      <Btn onClick={onRunFuel} disabled={analyticsLoading}>
        {analyticsLoading ? "…" : "Fuel drops only"}
      </Btn>
      <Btn onClick={onRunGprs} disabled={analyticsLoading}>
        GPS stale only
      </Btn>
      <Btn onClick={onRunBoth} disabled={analyticsLoading}>
        Run both
      </Btn>
    </div>
  );

  const toolbar = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: view === "minimized" ? 0 : 12,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700 }}>
        Analytics — {periodLabel}
        <span style={{ fontWeight: 400, color: t.textSoft, marginLeft: 8 }}>
          Fuel {fuelDropHits.length} · GPS {gprsGapHits.length}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {view !== "expanded" && (
          <button type="button" onClick={() => onViewChange("expanded")} style={toolBtn(t)}>
            Expand
          </button>
        )}
        {view === "expanded" && (
          <button type="button" onClick={() => onViewChange("normal")} style={toolBtn(t)}>
            Shrink
          </button>
        )}
        {view !== "minimized" && (
          <button type="button" onClick={() => onViewChange("minimized")} style={toolBtn(t)}>
            Minimize
          </button>
        )}
        {view === "minimized" && (
          <button type="button" onClick={() => onViewChange("normal")} style={toolBtn(t)}>
            Show panel
          </button>
        )}
        <button type="button" onClick={() => onViewChange("closed")} style={toolBtn(t)} title="Close">
          ✕
        </button>
      </div>
    </div>
  );

  if (view === "minimized") {
    return (
      <div
        style={{
          padding: "10px 14px",
          background: t.panel,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
        }}
      >
        {toolbar}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <Btn onClick={onRunFuel} disabled={analyticsLoading}>
            Fuel
          </Btn>
          <Btn onClick={onRunGprs} disabled={analyticsLoading}>
            GPS
          </Btn>
          <Btn onClick={onRunBoth} disabled={analyticsLoading}>
            Both
          </Btn>
        </div>
      </div>
    );
  }

  if (view === "expanded") {
    return (
      <>
        <div
          role="presentation"
          onClick={() => onViewChange("normal")}
          style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.4)", zIndex: 400 }}
        />
        <div
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 12,
            top: "10vh",
            zIndex: 401,
            background: t.panel,
            borderRadius: 14,
            boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
            display: "flex",
            flexDirection: "column",
            padding: 16,
            overflow: "hidden",
          }}
        >
          {toolbar}
          {controls}
          <div style={{ flex: 1, minHeight: 0, marginTop: 12, display: "flex" }}>
            <HitLists fuelDropHits={fuelDropHits} gprsGapHits={gprsGapHits} t={t} fill />
          </div>
        </div>
      </>
    );
  }

  return (
    <Panel
      title="Monitoring analytics"
      subtitle={`Period ${periodLabel}. Minimize or ✕ close so the fleet table stays visible.`}
    >
      {toolbar}
      {controls}
      <div style={{ marginTop: 16 }}>
        <HitLists fuelDropHits={fuelDropHits} gprsGapHits={gprsGapHits} t={t} maxHeight={220} />
      </div>
    </Panel>
  );
}

function toolBtn(t) {
  return {
    border: `1px solid ${t.border}`,
    background: t.bg,
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    color: t.text,
  };
}
