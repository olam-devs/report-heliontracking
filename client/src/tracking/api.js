const API_BASE = "/api/tracking";
const TOKEN_KEY = "token";

export { API_BASE };

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function logout() {
  setToken(null);
}

function defaultTimeoutMs(path, method = "GET") {
  if (/\/daily-log\/report/.test(path) && method === "GET") return 300000;
  if (/\/analytics\//.test(path)) return 600000;
  if (/\/notifications/.test(path) && method === "GET") return 600000;
  return 20000;
}

export async function apiFetch(path, opts = {}) {
  const method = opts.method || "GET";
  const timeoutMs = opts.timeoutMs ?? defaultTimeoutMs(path, method);
  const { body, headers: extraHeaders } = opts;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = getToken();
    const hasBody = body != null;
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(hasBody && !(body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      ...(hasBody
        ? {
            body: typeof body === "string" || body instanceof Blob ? body : JSON.stringify(body),
          }
        : {}),
    });
    if (res.status === 401) {
      logout();
      if (typeof window !== "undefined") window.location.assign("/login");
    }
    if (res.status === 403) {
      throw new Error("You do not have permission to access Tracking / Daily Fleet Report.");
    }
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Invalid response from server (HTTP ${res.status})`);
    }
    if (!res.ok || json.success === false) {
      throw new Error(json.message || json.error || `HTTP ${res.status}`);
    }
    return json.data ?? json;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`Request timed out (${Math.round(timeoutMs / 1000)}s)`);
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

export function googleMapsDirUrl(alert) {
  return alert?.mapsRouteUrl || null;
}
