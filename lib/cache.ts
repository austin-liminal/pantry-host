/**
 * Application-level localStorage cache for GraphQL data.
 * Used to serve stale data when the GraphQL server (port 4001) is unreachable offline.
 */

export function cacheSet(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // localStorage may be unavailable (private browsing quota, SSR)
  }
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return (JSON.parse(raw) as { ts: number; data: T }).data;
  } catch {
    return null;
  }
}
