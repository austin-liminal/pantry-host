export type IntegrationState =
  | { state: 'not_configured' }
  | { state: 'awaiting_auth'; auth_url: string }
  | { state: 'connecting' }
  | { state: 'connected'; label: string }
  | { state: 'skipped' }
  | { state: 'unavailable'; reason: string };

export interface SetupStatus {
  complete: boolean;
  integrations: {
    tailscale: IntegrationState;
    bluesky: IntegrationState;
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.status === 204 ? (undefined as T) : (r.json() as Promise<T>);
}

export const api = {
  getSetupStatus: () => request<SetupStatus>('/api/setup-status'),
  finishSetup: () => request<void>('/api/setup-complete', { method: 'POST', body: '{}' }),
  resetSetup: () => request<void>('/api/setup-complete', { method: 'POST', body: JSON.stringify({ reset: true }) }),
};
