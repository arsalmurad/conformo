import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCAL_FORMAT, LocalNumberingProvider, WebhookNumberingProvider, type LocalSeriesFormat } from './provider.js';
import type { NumberingProvider } from './provider.js';
import { setNextCounterValue } from './localCounter.js';

export type NumberingConfig = { kind: 'local'; seriesId: string; format?: LocalSeriesFormat } | { kind: 'webhook'; url: string };

const DEFAULT_CONFIG: NumberingConfig = { kind: 'local', seriesId: 'default' };
const KEY = 'conformo.numbering';

function loadConfig(): NumberingConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw) as NumberingConfig;
      if (c.kind === 'local' && typeof c.seriesId === 'string') return c;
      if (c.kind === 'webhook' && typeof c.url === 'string') return c;
    }
  } catch { /* storage blocked or corrupt: fall back to the default series */ }
  return DEFAULT_CONFIG;
}

function buildProvider(config: NumberingConfig): NumberingProvider {
  return config.kind === 'local' ? new LocalNumberingProvider(config.seriesId, config.format ?? DEFAULT_LOCAL_FORMAT) : new WebhookNumberingProvider(config.url);
}

/** The numbering source (a gapless local sequence by default, or the user's own webhook), its settings, and the
 * "assign the next number" action. The settings are remembered on this device; the counter itself lives in
 * IndexedDB (localCounter.ts). */
export function useNumbering() {
  const [config, setConfigState] = useState<NumberingConfig>(loadConfig);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [peek, setPeek] = useState<string | undefined>(undefined);
  const [version, setVersion] = useState(0);

  const provider = useMemo(() => buildProvider(config), [config]);

  useEffect(() => {
    let cancelled = false;
    if (provider instanceof LocalNumberingProvider) {
      provider.peek().then((n) => { if (!cancelled) setPeek(n); }).catch(() => { if (!cancelled) setPeek(undefined); });
    } else setPeek(undefined);
    return () => { cancelled = true; };
  }, [provider, version]);

  const setConfig = useCallback((c: NumberingConfig) => {
    setConfigState(c);
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
  }, []);

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
      setVersion((v) => v + 1);
    }
  }

  /** Continue an existing sequence: prefix + the number the next invoice should get. */
  async function continueFrom(prefix: string, next: number, padTo: number): Promise<void> {
    const c: NumberingConfig = { kind: 'local', seriesId: config.kind === 'local' ? config.seriesId : 'default', format: { prefix, padTo } };
    await setNextCounterValue(c.seriesId, next);
    setConfig(c);
    setVersion((v) => v + 1);
  }

  return { config, setConfig, provider, assignNext, assigning, error, peek, continueFrom };
}

export type Numbering = ReturnType<typeof useNumbering>;
