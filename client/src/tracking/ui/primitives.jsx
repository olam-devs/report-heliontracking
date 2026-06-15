import { useTheme } from "../theme.jsx";

export function Panel({ title, subtitle, children, action }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        background: t.panel,
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(26,35,50,0.06)",
      }}
    >
      {(title || subtitle) && (
        <div
          style={{
            padding: "12px 18px",
            borderBottom: `1px solid ${t.border}`,
            background: t.panelBright,
          }}
        >
          {title && (
            <div style={{ color: t.text, fontWeight: 800, fontSize: 13 }}>{title}</div>
          )}
          {subtitle && (
            <div style={{ color: t.textSoft, fontSize: 12, marginTop: title ? 6 : 0, lineHeight: 1.45 }}>
              {subtitle}
            </div>
          )}
          {action}
        </div>
      )}
      <div style={{ padding: title || subtitle ? 18 : 0 }}>{children}</div>
    </div>
  );
}

export function Inp({ label, ...props }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <label style={{ color: t.textSoft, fontSize: 12, fontWeight: 600 }}>{label}</label>
      )}
      <input
        {...props}
        style={{
          background: t.bg,
          border: `1.5px solid ${t.border}`,
          borderRadius: 10,
          padding: "10px 14px",
          color: t.text,
          fontSize: 13,
          fontFamily: "inherit",
          ...props.style,
        }}
      />
    </div>
  );
}

export function Sel({ label, options = [], ...props }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <label style={{ color: t.textSoft, fontSize: 12, fontWeight: 600 }}>{label}</label>
      )}
      <select
        {...props}
        style={{
          background: t.bg,
          border: `1.5px solid ${t.border}`,
          borderRadius: 10,
          padding: "10px 14px",
          color: t.text,
          fontSize: 13,
          fontFamily: "inherit",
          ...props.style,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Btn({ children, disabled, ...props }) {
  const { t } = useTheme();
  return (
    <button
      type="button"
      {...props}
      disabled={disabled}
      style={{
        background: t.accentAlt,
        border: "none",
        borderRadius: 10,
        padding: "10px 22px",
        color: "#fff",
        fontWeight: 700,
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontFamily: "inherit",
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

export function Badge({ children, color }) {
  const { t } = useTheme();
  color = color || t.textSoft;
  return (
    <span
      style={{
        background: `${color}15`,
        color,
        borderRadius: 8,
        padding: "3px 10px",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

export function ErrorBanner({ message }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        background: t.redSoft,
        border: `1px solid ${t.red}40`,
        borderRadius: 10,
        padding: "14px 18px",
        color: t.red,
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

export function Spinner({ label }) {
  const { t } = useTheme();
  return (
    <div style={{ padding: 48, textAlign: "center", color: t.textSoft }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>⟳</div>
      <div style={{ fontSize: 13 }}>{label || "Loading…"}</div>
    </div>
  );
}

export function Empty({ message }) {
  const { t } = useTheme();
  return (
    <div style={{ padding: 32, textAlign: "center", color: t.muted, fontSize: 13 }}>
      {message}
    </div>
  );
}
