import { useEffect, useRef, useState } from 'react';
import type { Invoice } from '@conformo/core';
import { useI18n } from '../i18n/I18n.js';
import type { Numbering } from '../numbering/useNumbering.js';
import { InvoiceDropzone } from '../import/InvoiceDropzone.js';

interface Props {
  invoice: Invoice;
  onImport: (invoice: Invoice) => void;
  onExportJson: () => void;
  protectedSince: boolean;
  onProtect: (passphrase: string) => void;
  numbering: Numbering;
}

/**
 * Everything secondary in one compact menu: encrypted autosave, the numbering source, import and JSON export. These
 * used to sit above the form and pushed the first field half a screen down on a laptop and ~870px down on a phone.
 * A native <details> disclosure: keyboard and screen-reader behaviour for free; Escape closes it.
 */
export function MoreMenu({ invoice, onImport, onExportJson, protectedSince, onProtect, numbering }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el.open) { el.open = false; el.querySelector('summary')?.focus(); }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);

  return (
    <details className="more-menu" ref={ref}>
      <summary className="btn btn-secondary">{t.actions.more}</summary>
      <div className="more-panel">
        <section className="more-block">
          <h3>{t.autosave.title}</h3>
          {protectedSince ? <p className="more-note">{t.autosave.on}</p> : <AutosaveForm onProtect={onProtect} />}
        </section>
        <section className="more-block">
          <h3>{t.numbering.settings}</h3>
          <NumberingSettings numbering={numbering} />
        </section>
        <section className="more-block">
          <h3>{t.actions.import}</h3>
          <InvoiceDropzone onImport={onImport} />
        </section>
        <section className="more-block">
          <button type="button" className="btn btn-secondary" onClick={onExportJson} disabled={!invoice}>
            {t.actions.exportJson}
          </button>
        </section>
      </div>
    </details>
  );
}

function AutosaveForm({ onProtect }: { onProtect: (passphrase: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  return (
    <form className="more-form" onSubmit={(e) => { e.preventDefault(); if (value.length >= 8) onProtect(value); }}>
      <p className="more-note">{t.autosave.body}</p>
      <label className="visually-hidden" htmlFor="autosave-pass">{t.autosave.placeholder}</label>
      <input id="autosave-pass" type="password" autoComplete="new-password" placeholder={t.autosave.placeholder} value={value} onChange={(e) => setValue(e.target.value)} minLength={8} />
      <button type="submit" className="btn btn-secondary" disabled={value.length < 8}>{t.autosave.enable}</button>
    </form>
  );
}

function NumberingSettings({ numbering }: { numbering: Numbering }) {
  const { t } = useI18n();
  const local = numbering.config.kind === 'local' ? numbering.config : undefined;
  const fmt = local?.format;
  const [prefix, setPrefix] = useState(fmt?.prefix ?? `INV-${new Date().getFullYear()}-`);
  const [next, setNext] = useState('');
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const [webhook, setWebhook] = useState(numbering.config.kind === 'webhook' ? numbering.config.url : '');
  return (
    <div className="more-form">
      <p className="more-note">{t.numbering.continueHint}</p>
      <div className="row">
        <div className="field">
          <label className="field-label" htmlFor="num-prefix">{t.numbering.prefix}</label>
          <input id="num-prefix" value={prefix} onChange={(e) => { setPrefix(e.target.value); setSaved(false); }} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="num-next">{t.numbering.nextValue}</label>
          <input id="num-next" inputMode="numeric" value={next} placeholder={numbering.peek?.slice(prefix.length) || '0001'} onChange={(e) => { setNext(e.target.value.replace(/\D/g, '')); setSaved(false); }} />
        </div>
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          const n = Number(next || '1');
          numbering.continueFrom(prefix, n, Math.max(1, next.length || 4)).then(() => { setSaved(true); setErr(undefined); }, (e: Error) => setErr(e.message));
        }}
      >
        {t.numbering.save}
      </button>
      {saved && <p className="more-note" role="status">{t.numbering.saved}</p>}
      {err && <p className="field-msg field-msg-error">{err}</p>}
      <details className="more-sub">
        <summary>{t.numbering.webhook}</summary>
        <div className="field">
          <label className="field-label" htmlFor="num-webhook">{t.numbering.webhookUrl}</label>
          <input id="num-webhook" type="url" placeholder="https://…/next-invoice-number" value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            onBlur={() => numbering.setConfig(webhook ? { kind: 'webhook', url: webhook } : { kind: 'local', seriesId: 'default', format: fmt })} />
        </div>
      </details>
    </div>
  );
}
