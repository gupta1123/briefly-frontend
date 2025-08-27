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

// Simple cache for API responses
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
const CACHE_TTL = {
  short: 30 * 1000,    // 30 seconds
  medium: 5 * 60 * 1000, // 5 minutes
  long: 30 * 60 * 1000,  // 30 minutes
};

function getCacheKey(url: string, headers: Record<string, string> = {}): string {
  const orgId = headers['X-Org-Id'] || currentOrgId;
  return `${orgId}:${url}`;
}

function getCachedResponse<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data;
  }
  if (cached) {
    cache.delete(key); // Remove expired cache
  }
  return null;
}

function setCachedResponse(key: string, data: any, ttl: number = CACHE_TTL.medium): void {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

function clearCacheForOrg(orgId: string): void {
  for (const [key] of cache) {
    if (key.startsWith(`${orgId}:`)) {
      cache.delete(key);
    }
  }
}

export function setApiContext(ctx: { orgId?: string }) {
  if (typeof ctx.orgId === 'string') {
    // Clear cache when switching orgs
    if (currentOrgId && currentOrgId !== ctx.orgId) {
      clearCacheForOrg(currentOrgId);
    }
    currentOrgId = ctx.orgId;
  }
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
  
  // Check cache for GET requests only
  const method = opts.method || 'GET';
  const cacheKey = getCacheKey(path, headers);
  
  if (method === 'GET') {
    const cached = getCachedResponse<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }
  
  // Attach Supabase JWT automatically when available (client-side only)
  try {
    const { supabase } = await import('@/lib/supabase');
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token && !headers['Authorization']) headers['Authorization'] = `Bearer ${token}`;
  } catch {}
  
  const res = await fetch(url, {
    method,
    headers,
    body: opts.body && headers['Content-Type'] === 'application/json' ? JSON.stringify(opts.body) : (opts.body as any),
    signal: opts.signal,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    let errorData: any = null;
    try { 
      errorData = await res.json(); 
      msg = errorData.error || errorData.message || msg; 
    } catch {}

    // Handle IP blocking specifically
    if (res.status === 403 && errorData?.code === 'IP_NOT_ALLOWED') {
      // Redirect to IP blocked page
      if (typeof window !== 'undefined') {
        window.location.href = '/ip-blocked';
        return;
      }
    }

    const error = new Error(`API ${opts.method || 'GET'} ${path} failed: ${msg}`);
    (error as any).status = res.status;
    (error as any).data = errorData;
    throw error;
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  
  let result: T;
  try { 
    result = JSON.parse(text) as T; 
  } catch { 
    result = text as unknown as T; 
  }
  
  // Cache successful GET responses
  if (method === 'GET' && res.ok) {
    // Determine TTL based on endpoint
    let ttl = CACHE_TTL.medium;
    if (path.includes('/documents')) {
      ttl = CACHE_TTL.short; // Documents change frequently
    } else if (path.includes('/me') || path.includes('/settings')) {
      ttl = CACHE_TTL.long; // User data changes less frequently
    } else if (path.includes('/orgs') || path.includes('/users')) {
      ttl = CACHE_TTL.medium;
    }
    
    setCachedResponse(cacheKey, result, ttl);
  }
  
  return result;
}

// SSE post utility for streaming chat responses
// SSE post utility for streaming chat responses with optional cancellation support
export async function ssePost(
  path: string,
  body: any,
  onEvent: (evt: { event: string; data: any }) => void,
  opts?: { signal?: AbortSignal }
) {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { supabase } = await import('@/lib/supabase');
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts?.signal });
  if (!res.ok || !res.body) throw new Error(`SSE request failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let seenEnd = false;

  // Support early cancellation via AbortSignal
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    try { reader.cancel(); } catch {}
  };
  if (opts?.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }
  const cleanup = () => {
    if (opts?.signal) opts.signal.removeEventListener('abort', onAbort);
  };

  try {
    while (true) {
      if (aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const lines = chunk.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        try { onEvent({ event, data: JSON.parse(data) }); }
        catch { onEvent({ event, data }); }
        if (event === 'end') { seenEnd = true; aborted = true; break; }
      }
      if (aborted) break;
    }
  } catch (err) {
    // Swallow network errors if we already saw 'end' or we aborted intentionally.
    if (!seenEnd && !aborted) throw err;
  } finally {
    cleanup();
  }
}
