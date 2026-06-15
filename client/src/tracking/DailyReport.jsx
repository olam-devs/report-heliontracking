import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTheme } from "./theme.jsx";
import { Inp, Sel, Btn, ErrorBanner, Spinner, Empty, Badge } from "./ui/primitives.jsx";
import { apiFetch } from "./api.js";
import { GprsCell, AntennaCell } from "./MonitorCells.jsx";
import { cameraStatusFromRow, CamCellLabel } from "./CameraEditor.jsx";
import VehicleEditDrawer from "./VehicleEditDrawer.jsx";
import { sortReportRows } from "./reportSort.js";
import { mergeManualRowFields } from "./rowMerge.js";

const LIVE_REFRESH_MS = 10000;
const fuelTodayIso = () => new Date().toISOString().slice(0, 10);

function fmtTs(isoOrStr) {
  if (!isoOrStr) return "—";
  const d = new Date(isoOrStr);
  if (Number.isNaN(d.getTime())) return String(isoOrStr).slice(0, 16);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function fmtDay(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

const BUNDLE_WARN_DAYS = 5;

function mergeBundleOnRow(row, date, days) {
  const start = new Date(`${date}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + Number(days));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86400000);
  const bundleLow = daysLeft <= BUNDLE_WARN_DAYS;
  return {
    ...row,
    bundlePurchasedDate: date,
    bundleDurationDays: days,
    bundleEndsOn: end.toISOString().slice(0, 10),
    bundleDaysLeft: daysLeft,
    bundleLow,
    hasIssues: Boolean(row.hasIssues) || bundleLow,
  };
}

export default function DailyReport({ readOnly = false }) {
  const { t } = useTheme();
  const today = fuelTodayIso();
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState("");
  const [reportRaw, setReportRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadGenRef = useRef(0);
  const [selectedDev, setSelectedDev] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [bundleDraft, setBundleDraft] = useState("");
  const [bundleDurationDraft, setBundleDurationDraft] = useState("");
  const [simPhoneDraft, setSimPhoneDraft] = useState("");
  const savingRef = useRef(false);
  const [updateHistory, setUpdateHistory] = useState(null);
  const [manualHistory, setManualHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [liveTick, setLiveTick] = useState(null);
  const [newNote, setNewNote] = useState("");
  const [cameraDraft, setCameraDraft] = useState({ mode: "unchecked", badChannels: [] });
  const [tableFull, setTableFull] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all"); // all|online|offline|issues|driving|parked
  const [checkedDevs, setCheckedDevs] = useState(() => new Set());
  const [bulkBundleStart, setBulkBundleStart] = useState(today);
  const [bulkBundleDays, setBulkBundleDays] = useState("30");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [vehicleCommentDraft, setVehicleCommentDraft] = useState("");
  const [driverPhoneDraft, setDriverPhoneDraft] = useState("");
  const [driverCommentDraft, setDriverCommentDraft] = useState("");
  const [bulkDriverPhone, setBulkDriverPhone] = useState("");
  const [bulkDriverComment, setBulkDriverComment] = useState("");
  const [bulkDriverApplying, setBulkDriverApplying] = useState(false);
  const [syncCountdown, setSyncCountdown] = useState(LIVE_REFRESH_MS / 1000);
  const [liveSyncing, setLiveSyncing] = useState(false);

  useEffect(() => {
    apiFetch("/vehicles")
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }, []);

  const isToday = true;

  const report = useMemo(() => {
    if (!reportRaw) return null;
    return { ...reportRaw, rows: sortReportRows(reportRaw.rows || []) };
  }, [reportRaw]);

  const loadReport = useCallback(
    async (forceRefresh = false) => {
      const gen = ++loadGenRef.current;
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ date: today });
        const data = await apiFetch(`/daily-log/report/quick?${q}`, { timeoutMs: 45000 });
        if (gen !== loadGenRef.current) return;
        setReportRaw((prev) =>
          data?.rows?.length
            ? { ...data, rows: sortReportRows(mergeManualRowFields(prev?.rows, data.rows)) }
            : data,
        );
      } catch (e) {
        if (gen !== loadGenRef.current) return;
        setError(e.message);
      } finally {
        if (gen === loadGenRef.current) setLoading(false);
      }
    },
    [today],
  );

  useEffect(() => {
    loadReport(false);
  }, [today, loadReport]);

  const loadLiveRefresh = useCallback(async () => {
    if (!reportRaw?.rows?.length || loading) return;
    setLiveSyncing(true);
    try {
      const q = new URLSearchParams({ date: today });
      const data = await apiFetch(`/daily-log/report/quick?${q}`, { timeoutMs: 45000 });
      if (data?.rows?.length) {
        setReportRaw((prev) =>
          prev
            ? {
                ...prev,
                rows: sortReportRows(mergeManualRowFields(prev.rows, data.rows)),
                liveRefreshedAt: data.reportRefreshedAt,
              }
            : prev,
        );
        setLiveTick(data.reportRefreshedAt);
      }
    } catch {
      /* keep last rows */
    } finally {
      setLiveSyncing(false);
      setSyncCountdown(LIVE_REFRESH_MS / 1000);
    }
  }, [today, reportRaw?.rows?.length, loading]);

  useEffect(() => {
    if (!autoRefresh || !isToday || !reportRaw?.rows?.length) return undefined;
    setSyncCountdown(LIVE_REFRESH_MS / 1000);
    const tickId = setInterval(() => {
      setSyncCountdown((n) => (n <= 1 ? LIVE_REFRESH_MS / 1000 : n - 1));
    }, 1000);
    const refreshId = setInterval(loadLiveRefresh, LIVE_REFRESH_MS);
    return () => {
      clearInterval(tickId);
      clearInterval(refreshId);
    };
  }, [autoRefresh, isToday, reportRaw?.rows?.length, loadLiveRefresh]);

  useEffect(() => {
    if (!selectedDev) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setSelectedDev(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedDev]);

  const selected = report?.rows?.find((r) => r.devIdno === selectedDev) || null;

  const selectRow = async (row) => {
    if (readOnly) return;
    setSelectedDev(row.devIdno);
    setNoteDraft(row.notes || "");
    setBundleDraft(row.bundlePurchasedDate || "");
    setBundleDurationDraft(
      row.bundleDurationDays != null && row.bundleDurationDays !== ""
        ? String(row.bundleDurationDays)
        : "",
    );
    setSimPhoneDraft(row.sim || "");
    setVehicleCommentDraft(row.vehicleComment || "");
    setDriverPhoneDraft(row.driverPhone || "");
    setDriverCommentDraft(row.driverComment || "");
    setNewNote("");
    setCameraDraft(cameraStatusFromRow(row));
    try {
      const [hist, manual, meta] = await Promise.all([
        apiFetch(`/daily-log/vehicle/${encodeURIComponent(row.devIdno)}/history`),
        apiFetch(`/daily-log/vehicle/${encodeURIComponent(row.devIdno)}/manual-history`),
        apiFetch(`/daily-log/vehicle/${encodeURIComponent(row.devIdno)}/meta`).catch(() => null),
      ]);
      setUpdateHistory(hist);
      setManualHistory(Array.isArray(manual) ? manual : []);
      if (meta) {
        setVehicleCommentDraft(meta.vehicleComment || "");
        setDriverPhoneDraft(meta.driverPhone || "");
        setDriverCommentDraft(meta.driverComment || "");
        if (meta.simPhone) setSimPhoneDraft(meta.simPhone);
        if (meta.bundlePurchasedDate) setBundleDraft(meta.bundlePurchasedDate);
        if (meta.bundleDurationDays != null) {
          setBundleDurationDraft(String(meta.bundleDurationDays));
        }
        setReportRaw((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            rows: prev.rows.map((r) =>
              r.devIdno === row.devIdno
                ? {
                    ...r,
                    vehicleComment: meta.vehicleComment || null,
                    driverPhone: meta.driverPhone || null,
                    driverComment: meta.driverComment || null,
                    sim: meta.simPhone || r.sim,
                    bundlePurchasedDate: meta.bundlePurchasedDate ?? r.bundlePurchasedDate,
                    bundleDurationDays: meta.bundleDurationDays ?? r.bundleDurationDays,
                  }
                : r,
            ),
          };
        });
      }
    } catch {
      setUpdateHistory(null);
      setManualHistory([]);
    }
  };

  const saveManual = async (patch) => {
    if (!selectedDev || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const q = new URLSearchParams({ date: today });
      const cam =
        patch.cameraStatus !== undefined ? patch.cameraStatus : cameraDraft;
      const dur =
        patch.bundleDurationDays !== undefined
          ? patch.bundleDurationDays
          : bundleDurationDraft;
      const body = {
        cameraStatus: cam,
        camerasOk:
          cam.mode === "all_ok" ? true : cam.mode === "issues" ? false : null,
        badChannels: cam.badChannels || [],
        notes: patch.notes !== undefined ? patch.notes : noteDraft,
        bundlePurchasedDate:
          patch.bundlePurchasedDate !== undefined
            ? patch.bundlePurchasedDate
            : bundleDraft || null,
        bundleDurationDays: dur === "" || dur == null ? null : parseInt(dur, 10),
        simPhone:
          patch.simPhone !== undefined ? patch.simPhone : simPhoneDraft.trim() || null,
        vehicleComment:
          patch.vehicleComment !== undefined
            ? patch.vehicleComment
            : vehicleCommentDraft.trim() || null,
        driverPhone:
          patch.driverPhone !== undefined
            ? patch.driverPhone
            : driverPhoneDraft.trim() || null,
        driverComment:
          patch.driverComment !== undefined
            ? patch.driverComment
            : driverCommentDraft.trim() || null,
        rowNo: report?.rows?.find((r) => r.devIdno === selectedDev)?.no,
      };
      const res = await apiFetch(
        `/daily-log/report/${encodeURIComponent(selectedDev)}?${q}`,
        { method: "PATCH", body },
      );
      const row = res?.row;
      const meta = res?.vehicleMeta;
      const mergedRow = row
        ? { ...row, no: report?.rows?.find((r) => r.devIdno === selectedDev)?.no }
        : {
            ...(meta || {}),
            devIdno: selectedDev,
            bundlePurchasedDate: body.bundlePurchasedDate,
            bundleDurationDays: body.bundleDurationDays,
          };
      setReportRaw((prev) => {
        if (!prev) return prev;
        const rows = sortReportRows(
          prev.rows.map((r) =>
            r.devIdno === selectedDev ? { ...r, ...mergedRow, no: r.no } : r,
          ),
        );
        return {
          ...prev,
          rows,
          issues: rows.flatMap((r) =>
            (r.issues || []).map((i) => ({
              ...i,
              devIdno: r.devIdno,
              plate: r.plate,
            })),
          ),
        };
      });
      if (meta?.vehicleComment != null) {
        setVehicleCommentDraft(meta.vehicleComment || "");
      } else if (mergedRow.vehicleComment != null) {
        setVehicleCommentDraft(mergedRow.vehicleComment || "");
      }
      if (meta?.driverPhone != null) setDriverPhoneDraft(meta.driverPhone || "");
      if (meta?.driverComment != null) setDriverCommentDraft(meta.driverComment || "");
      if (patch.notes != null) setNoteDraft(patch.notes);
      if (body.bundlePurchasedDate != null)
        setBundleDraft(body.bundlePurchasedDate || "");
      if (body.bundleDurationDays != null)
        setBundleDurationDraft(body.bundleDurationDays != null ? String(body.bundleDurationDays) : "");
      try {
        const hist = await apiFetch(
          `/daily-log/vehicle/${encodeURIComponent(selectedDev)}/history`,
        );
        setUpdateHistory(hist);
      } catch {
        setUpdateHistory(null);
      }
      if (res?.manualHistory) setManualHistory(res.manualHistory);
      else {
        try {
          const manual = await apiFetch(
            `/daily-log/vehicle/${encodeURIComponent(selectedDev)}/manual-history`,
          );
          setManualHistory(Array.isArray(manual) ? manual : []);
        } catch {
          /* optional */
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const addManualNote = async () => {
    if (!selectedDev || !newNote.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await apiFetch("/daily-log/entries", {
        method: "POST",
        body: {
          devIdno: selectedDev,
          plate: selected?.plate,
          manualNote: newNote.trim(),
          reportDate: today,
          entryType: "notes",
        },
      });
      setNewNote("");
      const row = report?.rows?.find((r) => r.devIdno === selectedDev);
      if (row) await selectRow(row);
    } catch (e) {
      setError(e.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const exportCmsv = () => {
    const rows = visibleRows;
    if (!rows.length) return;
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "NO",
      "PLATE",
      "DEVICE",
      "SIM",
      "DRIVER PHONE",
      "DRIVER",
      "BUNDLE",
      "CAM",
      "GPRS",
      "ANTENNA",
      "NOTES",
    ];
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.no ?? "",
          esc(r.plate),
          r.devIdno ?? "",
          r.sim ?? "",
          r.driverPhone ?? "",
          esc(r.driverComment),
          r.bundleDaysLeft != null
            ? `${r.bundleDaysLeft}d left`
            : r.bundlePurchasedDate ?? "",
          r.camerasOk === true ? "OK" : r.camerasOk === false ? "ISSUE" : "",
          r.gprsDisplay?.label || r.gprsOk === true ? "OK" : r.gprsOk === false ? "ISSUE" : "",
          r.antennaOk === true ? "OK" : r.antennaOk === false ? "ISSUE" : "",
          esc(r.notes || r.autoNotes),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Helion_CMSV_Fleet_${today}.csv`;
    a.click();
  };

  const visibleRows = useMemo(() => {
    let rows = report?.rows || [];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          String(r.plate || "").toLowerCase().includes(q) ||
          String(r.devIdno || "").toLowerCase().includes(q) ||
          String(r.sim || "").toLowerCase().includes(q) ||
          String(r.driverPhone || "").toLowerCase().includes(q) ||
          String(r.driverComment || "").toLowerCase().includes(q),
      );
    }
    if (statusFilter === "online") rows = rows.filter((r) => r.helionStatus === "connected");
    else if (statusFilter === "offline") rows = rows.filter((r) => r.helionStatus !== "connected");
    else if (statusFilter === "issues") rows = rows.filter((r) => r.hasIssues || r.bundleLow);
    else if (statusFilter === "driving") rows = rows.filter((r) => r.gprsDisplay?.moving === true);
    else if (statusFilter === "parked") rows = rows.filter((r) => r.gprsDisplay?.moving === false);
    else if (statusFilter === "bundle_low") rows = rows.filter((r) => r.bundleLow);
    return rows;
  }, [report?.rows, statusFilter, search]);
  const checkedCount = checkedDevs.size;

  const toggleCheck = (devIdno, e) => {
    e.stopPropagation();
    setCheckedDevs((prev) => {
      const next = new Set(prev);
      if (next.has(devIdno)) next.delete(devIdno);
      else next.add(devIdno);
      return next;
    });
  };

  const selectAllVisible = () => {
    setCheckedDevs(new Set(visibleRows.map((r) => r.devIdno)));
  };

  const clearChecked = () => setCheckedDevs(new Set());

  const applyBulkBundle = async () => {
    const days = parseInt(bulkBundleDays, 10);
    if (!checkedCount || !Number.isFinite(days) || days <= 0) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setBulkApplying(true);
    setError(null);
    try {
      const devIdnos = [...checkedDevs];
      const res = await apiFetch("/daily-log/bulk-bundle", {
        method: "POST",
        body: {
          devIdnos,
          bundlePurchasedDate: bulkBundleStart || today,
          bundleDurationDays: days,
        },
      });
      const date = res?.bundlePurchasedDate || bulkBundleStart;
      const idSet = new Set(devIdnos);
      setReportRaw((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r) =>
            idSet.has(r.devIdno) ? mergeBundleOnRow(r, date, days) : r,
          ),
        };
      });
      clearChecked();
    } catch (e) {
      setError(e.message);
    } finally {
      savingRef.current = false;
      setBulkApplying(false);
    }
  };

  const applyBulkDriver = async () => {
    if (!checkedCount || (!bulkDriverPhone.trim() && !bulkDriverComment.trim())) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setBulkDriverApplying(true);
    setError(null);
    try {
      const devIdnos = [...checkedDevs];
      await apiFetch("/daily-log/bulk-driver", {
        method: "POST",
        body: {
          devIdnos,
          driverPhone: bulkDriverPhone.trim() || null,
          driverComment: bulkDriverComment.trim() || null,
        },
      });
      setReportRaw((prev) => {
        if (!prev) return prev;
        const idSet = new Set(devIdnos);
        return {
          ...prev,
          rows: sortReportRows(
            prev.rows.map((r) =>
              idSet.has(r.devIdno)
                ? {
                    ...r,
                    driverPhone: bulkDriverPhone.trim() || r.driverPhone,
                    driverComment: bulkDriverComment.trim() || r.driverComment,
                  }
                : r,
            ),
          ),
        };
      });
      clearChecked();
    } catch (e) {
      setError(e.message);
    } finally {
      savingRef.current = false;
      setBulkDriverApplying(false);
    }
  };

  const tableToolbar = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "flex-end",
        padding: "10px 12px",
        background: t.panelBright,
        borderBottom: `1px solid ${t.border}`,
        position: "sticky",
        top: 0,
        zIndex: 4,
      }}
    >
      {autoRefresh && isToday && report?.rows?.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: liveSyncing ? t.accent : t.textSoft,
            padding: "6px 10px",
            borderRadius: 8,
            background: liveSyncing ? t.accentSoft : t.bg,
            border: `1px solid ${t.border}`,
          }}
        >
          <span className={liveSyncing ? "helion-sync-spin" : undefined} aria-hidden>
            ⟳
          </span>
          {liveSyncing ? "Syncing live data…" : `Live sync in ${syncCountdown}s`}
        </div>
      )}
      <Inp
        label="Search plate / device / SIM"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Type to filter…"
      />
      <Sel
        label="Status filter"
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        options={[
          { value: "all", label: "All vehicles" },
          { value: "online", label: "Online" },
          { value: "offline", label: "Offline" },
          { value: "driving", label: "Driving" },
          { value: "parked", label: "Parked" },
          { value: "issues", label: "Issues / alerts" },
          { value: "bundle_low", label: "Bundle expiring soon" },
        ]}
      />
      <Btn type="button" onClick={selectAllVisible} disabled={!visibleRows.length || readOnly}>
        Select all visible
      </Btn>
      <Btn type="button" onClick={clearChecked} disabled={!checkedCount || readOnly}>
        Clear ({checkedCount})
      </Btn>
      {!readOnly && (
        <>
      <Inp
        label="Bundle start"
        type="date"
        value={bulkBundleStart}
        onChange={(e) => setBulkBundleStart(e.target.value)}
      />
      <Inp
        label="Valid (days)"
        type="number"
        min={1}
        value={bulkBundleDays}
        onChange={(e) => setBulkBundleDays(e.target.value)}
        placeholder="30"
      />
      <Btn
        type="button"
        onClick={applyBulkBundle}
        disabled={!checkedCount || bulkApplying}
      >
        {bulkApplying ? "Applying…" : `Set bundle (${checkedCount})`}
      </Btn>
      <Btn
        type="button"
        onClick={applyBulkDriver}
        disabled={!checkedCount || bulkDriverApplying || (!bulkDriverPhone.trim() && !bulkDriverComment.trim())}
      >
        {bulkDriverApplying ? "Applying…" : `Set driver (${checkedCount})`}
      </Btn>
      <Inp
        label="Driver phone (bulk)"
        value={bulkDriverPhone}
        onChange={(e) => setBulkDriverPhone(e.target.value)}
        placeholder="255… or 07…"
      />
      <Inp
        label="Driver name (bulk)"
        value={bulkDriverComment}
        onChange={(e) => setBulkDriverComment(e.target.value)}
        placeholder="Driver name"
      />
        </>
      )}
      <Btn onClick={() => setTableFull((v) => !v)} disabled={!report?.rows?.length}>
        {tableFull ? "Exit full screen" : "Full screen"}
      </Btn>
      <div style={{ fontSize: 12, color: t.textSoft, marginLeft: "auto" }}>
        Showing <strong style={{ color: t.text }}>{visibleRows.length}</strong>
        {report?.rows?.length != null ? ` / ${report.rows.length}` : ""}
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flex: 1,
        minHeight: 0,
        height: "100%",
      }}
    >
      {readOnly && (
        <div style={{ padding: "8px 12px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
          View-only access — editing the daily fleet report is disabled.
        </div>
      )}
      {tableFull && (
        <div
          role="presentation"
          onClick={() => setTableFull(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            zIndex: 600,
          }}
        />
      )}
      <div
        style={{
          background: "linear-gradient(135deg, #0d2137 0%, #1a3a5c 100%)",
          color: "#fff",
          borderRadius: 10,
          padding: "8px 16px",
          textAlign: "center",
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: 0.5,
          flexShrink: 0,
        }}
      >
        HELION TRACKING — DAILY FLEET MONITORING REPORT
      </div>

      {error && (
        <div style={{ flexShrink: 0 }}>
          <ErrorBanner message={error} />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          background: t.panel,
          border: `1px solid ${t.border}`,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${t.border}`,
            background: t.panelBright,
            flexShrink: 0,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Fleet table — {today}</div>
            <div style={{ color: t.textSoft, fontSize: 11, marginTop: 4 }}>
              Live CMS data · auto-refresh 10s · search and filter above the table
            </div>
          </div>
          <Btn onClick={exportCmsv} disabled={!visibleRows.length}>
            Export CMSV
          </Btn>
        </div>
        <div
          style={
            tableFull
              ? {
                  position: "fixed",
                  inset: 8,
                  zIndex: 601,
                  background: t.panel,
                  borderRadius: 14,
                  padding: 0,
                  boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }
              : {
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }
          }
        >
          {tableToolbar}
          {loading && !report ? (
            <Spinner label="Building report from CMSV — can take 1–2 minutes…" />
          ) : !visibleRows.length && !loading && !reportRaw ? (
            <Empty message="No data yet. Click Refresh from CMS." />
          ) : visibleRows.length === 0 && reportRaw ? (
            <Empty
              message={
                search.trim()
                  ? "No vehicles match search — clear the search box."
                  : (reportRaw.summary?.total ?? 0) === 0
                    ? "CMS returned 0 vehicles. Check CMS password in report-portal/server/.env, then click Refresh from CMS."
                    : "No rows to display."
              }
            />
          ) : (
            <div
              style={{
                flex: 1,
                minHeight: tableFull ? 0 : 320,
                maxHeight: tableFull ? "none" : undefined,
                overflow: "auto",
                scrollBehavior: "smooth",
                border: tableFull ? "none" : `1px solid ${t.border}`,
                borderRadius: tableFull ? 0 : 10,
                opacity: loading ? 0.65 : 1,
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 3 }}>
                  <tr style={{ background: "#1a3a5c", color: "#fff" }}>
                    {[
                      "",
                      "NO",
                      "PLATE",
                      "DEVICE",
                      "SIM",
                      "DRIVER",
                      "BUNDLE",
                      "CAM",
                      "GPRS",
                      "ANTENNA",
                      "NOTES",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 8px",
                          textAlign: "left",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, idx) => {
                    const active = row.devIdno === selectedDev;
                    const isChecked = checkedDevs.has(row.devIdno);
                    const rowBg = row.bundleLow
                      ? idx % 2 === 0
                        ? "#fee2e2"
                        : "#fecaca"
                      : row.hasIssues
                        ? idx % 2 === 0
                          ? "#fff8e6"
                          : "#fff3cd"
                        : idx % 2 === 0
                          ? t.panel
                          : t.bg;
                    return (
                      <tr
                        key={row.devIdno}
                        onClick={() => selectRow(row)}
                        style={{
                          background: active ? t.accentSoft : isChecked ? "#e0f2fe" : rowBg,
                          cursor: "pointer",
                          borderBottom: `1px solid ${t.border}`,
                          boxShadow: active ? `inset 0 0 0 2px ${t.accent}` : undefined,
                        }}
                      >
                        <td style={{ padding: 8, width: 36 }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => toggleCheck(row.devIdno, e)}
                            aria-label={`Select ${row.plate}`}
                          />
                        </td>
                        <td style={{ padding: 8 }}>{row.no ?? idx + 1}</td>
                        <td style={{ padding: 8, fontWeight: 600, minWidth: 120 }}>
                          <div>{row.plate}</div>
                          {row.vehicleComment ? (
                            <span
                              style={{
                                display: "inline-block",
                                marginTop: 4,
                                padding: "2px 7px",
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 700,
                                background: "#fef3c7",
                                color: "#92400e",
                                border: "1px solid #fcd34d",
                              }}
                            >
                              {row.vehicleComment}
                            </span>
                          ) : null}
                        </td>
                        <td style={{ padding: 8, fontSize: 11 }}>{row.devIdno}</td>
                        <td style={{ padding: 8, fontSize: 11, fontFamily: "monospace" }}>
                          {row.sim || "—"}
                        </td>
                        <td style={{ padding: 8, fontSize: 11, minWidth: 100 }}>
                          <div style={{ fontFamily: "monospace" }}>
                            {row.driverPhone || "—"}
                          </div>
                          {row.driverComment ? (
                            <span
                              style={{
                                display: "inline-block",
                                marginTop: 4,
                                padding: "2px 7px",
                                borderRadius: 6,
                                fontSize: 10,
                                fontWeight: 700,
                                background: "#dbeafe",
                                color: "#1e40af",
                                border: "1px solid #93c5fd",
                              }}
                            >
                              {row.driverComment}
                            </span>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: 8,
                            fontSize: 11,
                            background: row.bundleLow ? "#fca5a5" : undefined,
                            color: row.bundleLow ? "#7f1d1d" : undefined,
                            fontWeight: row.bundleDaysLeft != null ? 700 : 400,
                          }}
                        >
                          {row.bundleDaysLeft != null ? (
                            <>
                              <div>
                                {row.bundleDaysLeft <= 0
                                  ? "Expired"
                                  : `${row.bundleDaysLeft}d left`}
                              </div>
                              {row.bundleEndsOn ? (
                                <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.85 }}>
                                  ends {fmtDay(row.bundleEndsOn)}
                                </div>
                              ) : null}
                            </>
                          ) : row.bundlePurchasedDate ? (
                            fmtDay(row.bundlePurchasedDate)
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ padding: 8 }}>
                          <CamCellLabel row={row} t={t} />
                        </td>
                        <td style={{ padding: 8 }}>
                          <GprsCell row={row} />
                        </td>
                        <td style={{ padding: 8 }}>
                          <AntennaCell row={row} />
                        </td>
                        <td
                          style={{
                            padding: 8,
                            maxWidth: 220,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.notes || row.autoNotes || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>


      {!readOnly && (
      <VehicleEditDrawer
        selected={selected}
        bundleDraft={bundleDraft}
        setBundleDraft={setBundleDraft}
        bundleDurationDraft={bundleDurationDraft}
        setBundleDurationDraft={setBundleDurationDraft}
        simPhoneDraft={simPhoneDraft}
        setSimPhoneDraft={setSimPhoneDraft}
        vehicleCommentDraft={vehicleCommentDraft}
        setVehicleCommentDraft={setVehicleCommentDraft}
        driverPhoneDraft={driverPhoneDraft}
        setDriverPhoneDraft={setDriverPhoneDraft}
        driverCommentDraft={driverCommentDraft}
        setDriverCommentDraft={setDriverCommentDraft}
        cameraDraft={cameraDraft}
        setCameraDraft={setCameraDraft}
        noteDraft={noteDraft}
        setNoteDraft={setNoteDraft}
        newNote={newNote}
        setNewNote={setNewNote}
        manualHistory={manualHistory}
        saving={saving}
        onSave={() =>
          saveManual({
            cameraStatus: cameraDraft,
            notes: noteDraft,
            bundlePurchasedDate: bundleDraft || null,
            bundleDurationDays: bundleDurationDraft,
            simPhone: simPhoneDraft.trim() || null,
            vehicleComment: vehicleCommentDraft.trim() || null,
            driverPhone: driverPhoneDraft.trim() || null,
            driverComment: driverCommentDraft.trim() || null,
          })
        }
        onAddNote={addManualNote}
        onClose={() => setSelectedDev(null)}
        fmtTs={fmtTs}
        fmtDay={fmtDay}
      />
      )}
    </div>
  );
}
