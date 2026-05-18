import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WizardShell from '@/components/WizardShell';
import { api, type IntegrationState } from '@/lib/api';

interface Props {
  tailscale: IntegrationState;
  bluesky: IntegrationState;
}

function describe(label: string, state: IntegrationState): { headline: string; sub?: string } {
  switch (state.state) {
    case 'connected':
      return { headline: `${label} · Connected`, sub: state.label };
    case 'skipped':
      return { headline: `${label} · Skipped` };
    case 'unavailable':
      return { headline: `${label} · Unavailable`, sub: state.reason };
    default:
      return { headline: `${label} · Not configured` };
  }
}

export default function Summary({ tailscale, bluesky }: Props) {
  const navigate = useNavigate();
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      await api.finishSetup();
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finish setup');
      setFinishing(false);
    }
  }

  const rows = [
    { key: 'tailscale', label: 'Mobile camera access', ...describe('Mobile camera access', tailscale) },
    { key: 'bluesky', label: 'Bluesky sharing', ...describe('Bluesky sharing', bluesky) },
  ];

  return (
    <WizardShell
      stepIndex={2}
      totalSteps={2}
      title="All set."
      back={{ label: 'Back', onClick: () => navigate('/') }}
      primary={{ label: finishing ? 'Finishing…' : 'Finish setup', onClick: finish, disabled: finishing }}
    >
      <p className="text-lg text-[var(--color-text-secondary)] mb-6">
        Here's what's configured. You can change any of this later in Settings.
      </p>
      <ul className="divide-y divide-[var(--color-border-card)] border border-[var(--color-border-card)] rounded-lg overflow-hidden">
        {rows.map((row) => (
          <li key={row.key} className="px-5 py-4 bg-[var(--color-bg-card)]">
            <p className="font-medium text-[var(--color-text-primary)]">{row.headline}</p>
            {row.sub && (
              <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{row.sub}</p>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--color-danger,#dc2626)]">
          {error}
        </p>
      )}
    </WizardShell>
  );
}
