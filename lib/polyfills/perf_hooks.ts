// Polyfill for perf_hooks in V8 isolate environments (rex/Cloudflare Workers)
// postgres uses `import { performance } from 'perf_hooks'` which fails in V8 isolates
export const performance: Performance = (globalThis as any).performance ?? {
  now: () => Date.now(),
  mark: () => {},
  measure: () => {},
  clearMarks: () => {},
  clearMeasures: () => {},
  getEntries: () => [],
  getEntriesByName: () => [],
  getEntriesByType: () => [],
  timeOrigin: Date.now(),
  toJSON: () => ({}),
} as Performance;
