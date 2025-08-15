export type ApiOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';

let currentOrgId = process.env.NEXT_PUBLIC_ORG_ID || '';

type Cb = (ctx: { orgId: string }) => void;
const subscribers = new Set<Cb>();

export function setApiContext(ctx: { orgId?: string }) {
  if (typeof ctx.orgId === 'string') currentOrgId = ctx.orgId;
  const snapshot = { orgId: currentOrgId };
  subscribers.forEach(cb => {
    try { cb(snapshot); } catch {}
  });
}

export function getApiContext() {
  return { orgId: currentOrgId };
}

export function onApiContextChange(cb: Cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export async function apiFetch<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (currentOrgId && !headers['X-Org-Id']) headers['X-Org-Id'] = currentOrgId;
  // Attach Supabase JWT automatically when available (client-side only)
  try {
    const { supabase } = await import('@/lib/supabase');
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token && !headers['Authorization']) headers['Authorization'] = `Bearer ${token}`;
  } catch {}
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body && headers['Content-Type'] === 'application/json' ? JSON.stringify(opts.body) : (opts.body as any),
    signal: opts.signal,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(`API ${opts.method || 'GET'} ${path} failed: ${msg}`);
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}