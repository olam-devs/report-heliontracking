import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api.js";
import { HELION_SIM_IMPORT_LINES } from "./helionSimSeed.js";
import { useTheme } from "./theme.jsx";
import { Btn, ErrorBanner, Inp, Panel, Spinner } from "./ui/primitives.jsx";

export default function UsersAdmin({ user }) {
  const { t } = useTheme();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [users, setUsers] = useState([]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [bulkPhones, setBulkPhones] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkDrivers, setBulkDrivers] = useState("");
  const [bulkDriverResult, setBulkDriverResult] = useState(null);

  const isAdmin = user?.role === "admin";

  const sorted = useMemo(() => {
    return [...users].sort((a, b) => String(a.username).localeCompare(String(b.username)));
  }, [users]);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await apiFetch("/admin/users");
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr(e.message || String(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      setErr("Admin only");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setErr("");
    try {
      await apiFetch("/admin/users", {
        method: "POST",
        body: { username: username.trim(), password, role },
      });
      setUsername("");
      setPassword("");
      setRole("user");
      await load();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const importPhones = async () => {
    setErr("");
    setBulkResult(null);
    const lines = bulkPhones
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const updates = [];
    for (const line of lines) {
      const parts = line.split(/[,\t|]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      if (parts.length >= 3) {
        const [plate, devIdno, phone] = parts;
        updates.push({ plate, devIdno, simPhone: phone });
        continue;
      }
      const [a, b] = parts;
      if (/^\d{10,}$/.test(String(b).replace(/\D/g, ""))) {
        updates.push(
          /^\d{3,6}$/.test(a) ? { devIdno: a, simPhone: b } : { plate: a, simPhone: b },
        );
      } else {
        updates.push(
          /^\d{3,6}$/.test(b) ? { devIdno: b, simPhone: a } : { plate: b, simPhone: a },
        );
      }
    }
    if (!updates.length) {
      setErr("No valid lines. Use: plate,phone or devIdno,phone per line.");
      return;
    }
    try {
      const res = await apiFetch("/admin/bulk-phones", { method: "POST", body: { updates } });
      setBulkResult(res);
      setBulkPhones("");
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const importDrivers = async () => {
    setErr("");
    setBulkDriverResult(null);
    const lines = bulkDrivers
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const updates = [];
    for (const line of lines) {
      const parts = line.split(/[,\t|]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      if (parts.length >= 3) {
        const [plate, driverPhone, driverComment] = parts;
        updates.push({ plate, driverPhone, driverComment });
        continue;
      }
      const [plate, driverPhone] = parts;
      updates.push({ plate, driverPhone });
    }
    if (!updates.length) {
      setErr("No valid lines. Use: plate,driverPhone or plate,driverPhone,driverName per line.");
      return;
    }
    try {
      const res = await apiFetch("/admin/bulk-drivers", { method: "POST", body: { updates } });
      setBulkDriverResult(res);
      setBulkDrivers("");
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const del = async (un) => {
    if (!un) return;
    setErr("");
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(un)}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Report Portal — User Management</div>
          <div style={{ fontSize: 12, color: t.textSoft }}>Create users who can access the report (no admin page access).</div>
        </div>
        <button
          type="button"
          onClick={() => window.location.assign("/")}
          style={{
            background: "transparent",
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            padding: "8px 16px",
            color: t.textSoft,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
          }}
        >
          Back to report
        </button>
      </header>

      {err && <ErrorBanner message={err} />}

      <Panel title="Create / update user" subtitle="If username already exists, it will be updated with the new password/role.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <Inp label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Inp label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: t.textSoft }}>
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 10,
                padding: "10px 12px",
                background: t.panel,
                color: t.text,
                fontFamily: "inherit",
              }}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <Btn onClick={create} disabled={!username.trim() || password.length < 4}>
            Save user
          </Btn>
          <Btn onClick={load} disabled={loading}>
            Refresh list
          </Btn>
        </div>
      </Panel>

      <Panel
        title="Bulk SIM / phone import"
        subtitle="One line per vehicle: plate,phone or devIdno,phone (comma, tab, or pipe separated)."
      >
        <textarea
          value={bulkPhones}
          onChange={(e) => setBulkPhones(e.target.value)}
          rows={8}
          placeholder={"ABC123,08012345678\n10001,08098765432"}
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <Btn onClick={importPhones} disabled={!bulkPhones.trim()}>
            Import phones
          </Btn>
          <Btn onClick={() => setBulkPhones(HELION_SIM_IMPORT_LINES)} style={{ background: t.bg, color: t.text }}>
            Load Helion list (47)
          </Btn>
          <Btn
            onClick={async () => {
              setErr("");
              try {
                const res = await apiFetch("/admin/seed-sims", {
                  method: "POST",
                  body: { force: true },
                });
                setBulkResult(res);
              } catch (e) {
                setErr(e.message || String(e));
              }
            }}
            style={{ background: t.bg, color: t.text }}
          >
            Apply all SIM defaults now
          </Btn>
        </div>
        {bulkResult?.updated != null && (
          <div style={{ marginTop: 8, fontSize: 12, color: t.textSoft }}>
            Updated <strong>{bulkResult.updated}</strong> vehicle(s).
          </div>
        )}
      </Panel>

      <Panel
        title="Bulk driver import"
        subtitle="One line per vehicle: plate,driverPhone or plate,driverPhone,driverName"
      >
        <textarea
          value={bulkDrivers}
          onChange={(e) => setBulkDrivers(e.target.value)}
          rows={8}
          placeholder={"T 765 EMX,255700000001,John\nT 774 EMX,255700000002"}
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
        <Btn onClick={importDrivers} disabled={!bulkDrivers.trim()} style={{ marginTop: 8 }}>
          Import drivers
        </Btn>
        {bulkDriverResult?.updated != null && (
          <div style={{ marginTop: 8, fontSize: 12, color: t.textSoft }}>
            Updated <strong>{bulkDriverResult.updated}</strong> vehicle(s).
          </div>
        )}
      </Panel>

      <Panel title={`Users (${sorted.length})`} subtitle="Only admin sees this page.">
        {loading ? (
          <Spinner label="Loading users…" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.map((u) => (
              <div
                key={u.username}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  background: t.panel,
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>{u.username}</div>
                  <div style={{ fontSize: 11, color: t.textSoft }}>role: {u.role || "user"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => del(u.username)}
                  disabled={String(u.username).toLowerCase() === String(user?.username || "").toLowerCase()}
                  style={{
                    border: `1px solid ${t.border}`,
                    background: t.bg,
                    borderRadius: 10,
                    padding: "8px 14px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    color: t.red,
                    fontWeight: 700,
                  }}
                  title="Delete user"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

