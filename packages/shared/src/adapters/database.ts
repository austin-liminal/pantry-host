/**
 * Storage adapter interface for database operations.
 * Implemented by PostgresAdapter (packages/app) and PGliteAdapter (packages/web).
 */
export interface DatabaseAdapter {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T>;
}
