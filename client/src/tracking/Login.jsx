import { useState } from "react";
import { apiFetch, setToken } from "./api.js";
import { useTheme } from "./theme.jsx";
import { Btn, ErrorBanner, Inp } from "./ui/primitives.jsx";

export default function Login() {
  const { t } = useTheme();
  const [username, setUsername] = useState("Helion");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      setToken(data.token);
      window.location.replace("/");
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0d2137 0%, #1a3a5c 50%, #0d2137 100%)",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 400,
          background: t.panel,
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1a3a5c" }}>HELION TRACKING</div>
          <div style={{ fontSize: 13, color: t.textSoft, marginTop: 6 }}>Daily Fleet Report Portal</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Inp
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <Inp
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {err && <ErrorBanner message={err} />}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 8,
              background: t.accentAlt,
              border: "none",
              borderRadius: 10,
              padding: "12px 22px",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
