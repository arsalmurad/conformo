import { useState } from 'react';
import { LocalNumberingProvider, WebhookNumberingProvider } from './provider.js';
import type { NumberingProvider } from './provider.js';

export type NumberingConfig = { kind: 'local'; seriesId: string } | { kind: 'webhook'; url: string };

const DEFAULT_CONFIG: NumberingConfig = { kind: 'local', seriesId: 'default' };

function buildProvider(config: NumberingConfig): NumberingProvider {
  return config.kind === 'local' ? new LocalNumberingProvider(config.seriesId) : new WebhookNumberingProvider(config.url);
}

/** Owns the numbering provider selection and the "assign the next number"
 * action. Deliberately NOT persisted alongside the invoice draft: the
 * counter itself already persists (see localCounter.ts), and re-deriving
 * the provider from a config the user can see and change is simpler than
 * serializing a class instance. */
export function useNumbering() {
  const [config, setConfig] = useState<NumberingConfig>(DEFAULT_CONFIG);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const provider = buildProvider(config);

  async function assignNext(): Promise<string | undefined> {
    setAssigning(true);
    setError(undefined);
    try {
      return await provider.next();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setAssigning(false);
    }
  }

  return { config, setConfig, provider, assignNext, assigning, error };
}
