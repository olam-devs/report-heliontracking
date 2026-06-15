import { useEffect, useState } from "react";
import { apiFetch, getToken } from "./api.js";
import Login from "./Login.jsx";
import DailyReport from "./DailyReport.jsx";
import UsersAdmin from "./UsersAdmin.jsx";
import { Spinner } from "./ui/primitives.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const path =
    typeof window !== "undefined" ? window.location.pathname.replace(/\/$/, "") : "";
  const isLogin = path === "/login" || path.endsWith("/login");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setChecking(false);
      if (!isLogin) window.location.replace("/login");
      return;
    }
    apiFetch("/auth/me")
      .then((u) => setUser(u))
      .catch(() => {
        if (!isLogin) window.location.replace("/login");
      })
      .finally(() => setChecking(false));
  }, [isLogin]);

  if (isLogin) return <Login />;
  if (checking) return <Spinner label="Loading…" />;
  if (!user) return null;

  const route = typeof window !== "undefined" ? window.location.pathname.replace(/\/$/, "") : "";
  const isUsersAdmin = route === "/admin/users";

  return (
    <div
      style={{
        maxWidth: isUsersAdmin ? 1400 : "100%",
        margin: "0 auto",
        padding: isUsersAdmin ? "16px 20px 40px" : "8px 12px 12px",
        height: isUsersAdmin ? undefined : "100vh",
        boxSizing: "border-box",
        display: isUsersAdmin ? "block" : "flex",
        flexDirection: isUsersAdmin ? undefined : "column",
        overflow: isUsersAdmin ? undefined : "hidden",
      }}
    >
      {isUsersAdmin ? (
        <UsersAdmin user={user} />
      ) : (
        <DailyReport username={user.username} user={user} />
      )}
    </div>
  );
}
