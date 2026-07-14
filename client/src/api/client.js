const TOKEN_KEY = 'purosoul_auth';

export function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY)) || null;
  } catch {
    return null;
  }
}

export function setAuth(auth) {
  if (auth) localStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(path, window.location.origin);
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
    window.location.href = '/login';
    throw new ApiError('Session expired', 401);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
};

/** Authenticated file download (CSV/PDF) via blob — keeps the JWT in the header. */
export async function apiDownload(path, params, fallbackName) {
  const url = new URL(path, window.location.origin);
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
