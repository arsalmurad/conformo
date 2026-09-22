import { useState } from 'react';
import { useNumbering } from '../numbering/useNumbering.js';
import { FieldErrors } from './FieldErrors.js';
import type { RuleResult } from '@invoice-engine/validate/browser';

interface Props {
  value: string;
  onChange: (number: string) => void;
  errors?: RuleResult[];
}

/** Replaces a free-text invoice number with an assigned one: the hard
 * requirement is literally that the user "must not be able to free-type a
 * number that breaks the sequence" , so once a
 * number is assigned this field shows it read-only rather than editable.
 * A gapless number, once drawn, stays drawn even if this draft is later
 * abandoned — that's what gapless means in real bookkeeping, not a bug to
 * work around here. */
export function NumberField({ value, onChange, errors }: Props) {
  const { config, setConfig, provider, assignNext, assigning, error } = useNumbering();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <label className={`field ${errors?.length || error ? 'field-invalid' : ''}`}>
      <span className="field-label">Invoice number</span>
      {value ? (
        <input value={value} readOnly aria-readonly title="Assigned from the numbering sequence — not editable" />
      ) : (
        <button type="button" onClick={() => void assignNext().then((n) => n && onChange(n))} disabled={assigning}>
          {assigning ? 'Assigning…' : `Assign next number (${provider.label})`}
        </button>
      )}
      <button type="button" className="number-settings-toggle" onClick={() => setShowSettings((s) => !s)}>
        {showSettings ? 'Hide' : 'Change'} numbering source
      </button>
      {showSettings && (
        <div className="number-settings">
          <label>
            <input
              type="radio"
              checked={config.kind === 'local'}
              onChange={() => setConfig({ kind: 'local', seriesId: 'default' })}
            />
            Local sequence (this device, no server)
          </label>
          <label>
            <input type="radio" checked={config.kind === 'webhook'} onChange={() => setConfig({ kind: 'webhook', url: '' })} />
            Webhook (your own server — SQLite, Postgres, or anything else behind it)
          </label>
          {config.kind === 'webhook' && (
            <input
              className="number-webhook-url"
              placeholder="https://your-server.example/next-invoice-number"
              value={config.url}
              onChange={(e) => setConfig({ kind: 'webhook', url: e.target.value })}
            />
          )}
        </div>
      )}
      <FieldErrors errors={errors} />
      {error && <p className="field-hint">Couldn't assign a number: {error}</p>}
    </label>
  );
}
