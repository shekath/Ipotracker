/** Base URL of the PHP backend. Relative by default so the site works in any folder. */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? './api';

export async function getJSON<T>(path: string, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/${path}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const type = res.headers.get('content-type') ?? '';
    // A static host without PHP returns the PHP source or index.html instead of JSON.
    if (!res.ok || !type.includes('json')) throw new Error(`API ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}
