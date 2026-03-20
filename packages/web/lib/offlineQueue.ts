/**
 * Stub — the web PWA executes all mutations locally via PGlite.
 * No offline queue needed since there's no remote server.
 */

export function enqueue(_mutation: string, _variables?: Record<string, unknown>): void {
  // no-op — mutations execute directly against PGlite
}

export function getPendingCount(): number {
  return 0;
}
