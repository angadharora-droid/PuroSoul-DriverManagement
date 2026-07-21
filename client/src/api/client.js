const TOKEN_KEY = 'purosoul_auth';

// Bump whenever the saved-session shape changes. Sessions written by an older
// build are discarded rather than half-understood by newer code.
const SESSION_VERSION = 1;

// Same-origin by default; set VITE_API_URL at build time when the API is
// hosted on a different domain (e.g. Vercel frontend + separate backend).
const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

/** Expiry (ms since epoch) claimed by the JWT, or null if it can't be read. */
function tokenExpiresAt(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const json = decodeURIComponent(
      Array.from(bytes, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
    );
    const exp = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function isUsableSession(s) {
  if (!s || s.v !== SESSION_VERSION) return false;
  if (typeof s.token !== 'string' || !s.token) return false;
  if (!s.user || !s.user.id || (s.user.role !== 'admin' && s.user.role !== 'collector')) return false;
  const expiresAt = tokenExpiresAt(s.token);
  return expiresAt === null || expiresAt > Date.now();
}

/** Saved session, or null — anything outdated, malformed or expired is dropped on read. */
export function getAuth() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(TOKEN_KEY));
  } catch {
    saved = null;
  }
  if (isUsableSession(saved)) return saved;
  if (saved !== null) localStorage.removeItem(TOKEN_KEY);
  return null;
}

export function setAuth(auth) {
  if (auth) localStorage.setItem(TOKEN_KEY, JSON.stringify({ ...auth, v: SESSION_VERSION }));
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, params, redirectOn401 = true } = {}) {
  const url = new URL(path, API_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }

  const auth = getAuth();
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth) {
    setAuth(null);
    if (redirectOn401 && window.location.pathname !== '/login') window.location.href = '/login';
    throw new ApiError('Session expired', 401);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

/**
 * Startup check for a saved session. Returns the refreshed session, or null when
 * the API rejects it (expired, revoked, deactivated account). If the API can't be
 * reached the saved session is kept — a flaky network shouldn't log anyone out.
 */
export async function verifySession() {
  const saved = getAuth();
  if (!saved) return null;
  try {
    const { user } = await request('/api/auth/me', { redirectOn401: false });
    const next = { ...saved, user: { ...saved.user, ...user } };
    setAuth(next);
    return next;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      setAuth(null);
      return null;
    }
    return saved;
  }
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
};

/** Authenticated file download (CSV/PDF) via blob — keeps the JWT in the header. */
export async function apiDownload(path, params, fallbackName) {
  const url = new URL(path, API_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const auth = getAuth();
  const res = await fetch(url, { headers: auth?.token ? { Authorization: `Bearer ${auth.token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || `Download failed (${res.status})`, res.status, data);
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = match ? match[1] : fallbackName || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
