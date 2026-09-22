import { useState } from 'react';
import type { TemplateId } from '@invoice-engine/pdf';
import { TEMPLATES } from '@invoice-engine/pdf';
import { useInvoiceDraft } from './state/useInvoiceDraft.js';
import { useLiveValidation } from './validation/useLiveValidation.js';
import { InvoiceEditor } from './editor/InvoiceEditor.js';
import { buildInvoicePdf, downloadPdf } from './pdf/exportPdf.js';
import { UnlockScreen } from './UnlockScreen.js';
import './App.css';

export default function App() {
  const { invoice, setInvoice, lock, protectedSince, protect, unlock, discardLockedDraft } = useInvoiceDraft();
  const [country, setCountry] = useState<'FR' | undefined>(undefined);
  const [template, setTemplate] = useState<TemplateId>('classic');
  const [exporting, setExporting] = useState(false);
  const validation = useLiveValidation(invoice, country);

  if (lock.status === 'checking') return null;
  if (lock.status === 'locked' || lock.status === 'wrong-passphrase') {
    return <UnlockScreen wrongPassphrase={lock.status === 'wrong-passphrase'} onUnlock={unlock} onDiscard={discardLockedDraft} />;
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const bytes = await buildInvoicePdf(invoice, template);
      downloadPdf(bytes, `${invoice.number || 'invoice'}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(invoice, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.number || 'invoice'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>invoice-engine</h1>
        <div className="app-header-controls">
          <label>
            Country rules
            <select value={country ?? ''} onChange={(e) => setCountry((e.target.value || undefined) as 'FR' | undefined)}>
              <option value="">EN 16931 only</option>
              <option value="FR">France (BR-FR Flux 2)</option>
            </select>
          </label>
          <label>
            Template
            <select value={template} onChange={(e) => setTemplate(e.target.value as TemplateId)}>
              {Object.entries(TEMPLATES).map(([id, t]) => (
                <option key={id} value={id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <ValidationSummary checking={validation.checking} ready={validation.ready} errorCount={validation.errorCount} />

      <InvoiceEditor invoice={invoice} onChange={setInvoice} validation={validation} />

      <footer className="app-footer">
        {!protectedSince && (
          <ProtectPrompt onProtect={protect} />
        )}
        <div className="app-footer-actions">
          <button type="button" onClick={exportJson}>
            Export JSON
          </button>
          <button type="button" className="primary" onClick={exportPdf} disabled={exporting}>
            {exporting ? 'Building PDF…' : 'Download PDF'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function ValidationSummary({ checking, ready, errorCount }: { checking: boolean; ready: boolean; errorCount: number }) {
  if (!ready) return <p className="validation-summary">Validating…</p>;
  if (errorCount === 0) {
    return <p className="validation-summary validation-ok">✓ Passes EN 16931{checking ? ' (rechecking…)' : ''}</p>;
  }
  return (
    <p className="validation-summary validation-bad">
      {errorCount} issue{errorCount === 1 ? '' : 's'} to fix{checking ? ' (rechecking…)' : ''}
    </p>
  );
}

function ProtectPrompt({ onProtect }: { onProtect: (passphrase: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="protect-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.length >= 8) onProtect(value);
      }}
    >
      <input
        type="password"
        placeholder="Set a passphrase to save this draft on this device"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        minLength={8}
      />
      <button type="submit" disabled={value.length < 8}>
        Enable encrypted autosave
      </button>
    </form>
  );
}
