export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const KEY = 'sen.auth';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const tokens = {
  get(): Tokens | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(t: Tokens) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken }));
    } catch {
      /* navigation privée : session limitée à l'onglet */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const t = tokens.get();
  if (!t) return false;
  refreshing ??= fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: t.refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      tokens.set(await r.json());
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function onUnauthorized() {
  tokens.clear();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

async function raw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const t = tokens.get();
  const headers = new Headers(init.headers);
  if (t) headers.set('Authorization', `Bearer ${t.accessToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${API_URL}/v1${path}`, { ...init, headers });
  if (res.status === 401 && retry && t) {
    if (await refresh()) return raw(path, init, false);
    onUnauthorized();
  }
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      msg = Array.isArray(body.message) ? body.message.join(' · ') : body.message ?? msg;
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await raw(path, init);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

/** Télécharge un export (Excel / PDF) authentifié. */
export async function download(path: string, fallbackName: string) {
  const res = await raw(path);
  const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== 'all') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
}
