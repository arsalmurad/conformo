import { useState } from 'react';
import type { TemplateId } from '@conformo/pdf';
import { TEMPLATES } from '@conformo/pdf';
import { useInvoiceDraft } from './state/useInvoiceDraft.js';
import { useLiveValidation } from './validation/useLiveValidation.js';
import { useTouchedFields } from './validation/useTouchedFields.js';
import { visibleIssues, type Issue } from './validation/visibleIssues.js';
import { useComplianceCountries } from './useComplianceCountries.js';
import { InvoiceEditor } from './editor/InvoiceEditor.js';
import { InvoiceDropzone } from './import/InvoiceDropzone.js';
import { InvoicePreview } from './preview/InvoicePreview.js';
import { buildInvoicePdf, downloadPdf, type EmbeddableLogo } from './pdf/exportPdf.js';
import { UnlockScreen } from './UnlockScreen.js';
import './App.css';

/** Only France's CIUS Schematron is actually compiled into this build (see
 * CONTRIBUTING.md invariant 6: "never claim compliance, show it"). The selector
 * still lists every country packages/compliance-data ships, so adding a
 * country to the dataset grows this list on its own, but every option
 * except France stays disabled until its own layer is compiled and proven —
 * an unimplemented option must never look choosable. */
const COMPILED_COUNTRIES = new Set(['FR']);

/** Scrolls to and focuses the input an issue was attributed to (Part C:
 * "clicking an issue scrolls to and focuses the offending field"). Also
 * marks the field touched, so its own inline error appears in place too —
 * clicking the summary and reading the field itself should never disagree. */
function goToField(key: string, markTouched: (key: string) => void) {
  markTouched(key);
  const el = document.querySelector<HTMLElement>(`[data-field="${key}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();
}

export default function App() {
  const { invoice, setInvoice, profiles, saveProfile, deleteProfile, lock, protectedSince, protect, unlock, discardLockedDraft } =
    useInvoiceDraft();
  const [country, setCountry] = useState<'FR' | undefined>(undefined);
  const [template, setTemplate] = useState<TemplateId>('classic');
  const [exporting, setExporting] = useState(false);
  const [paymentLink, setPaymentLink] = useState('');
  const [logo, setLogo] = useState<EmbeddableLogo | undefined>(undefined);
  const validation = useLiveValidation(invoice, country);
  const touchedFields = useTouchedFields();
  const complianceCountries = useComplianceCountries();
  const isUntouched = !invoice.number && !invoice.seller.name && !invoice.buyer.name && invoice.lines.every((l) => !l.name);
  // Below 768px the editor and preview stack vertically (.workspace's own
  // media query) — the preview used to be a long scroll below the entire
  // form. This toggle switches which one is visible instead, so the preview
  // is one tap away rather than at the bottom of the page. Both stay
  // mounted (CSS-only show/hide, see .workspace.mobile-view-*) so switching
  // back and forth never re-triggers a preview rebuild or loses form focus.
  const [mobileView, setMobileView] = useState<'form' | 'preview'>('form');

  if (lock.status === 'checking') return null;
  if (lock.status === 'locked' || lock.status === 'wrong-passphrase') {
    return <UnlockScreen wrongPassphrase={lock.status === 'wrong-passphrase'} onUnlock={unlock} onDiscard={discardLockedDraft} />;
  }

  async function exportPdf() {
    touchedFields.revealAll(); // "validate the whole document on first export attempt"
    setExporting(true);
    try {
      const bytes = await buildInvoicePdf(invoice, template, { logo, paymentLink: paymentLink || undefined });
      downloadPdf(bytes, `${invoice.number || 'invoice'}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  function exportJson() {
    touchedFields.revealAll();
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
        <h1>Conformo</h1>
        <div className="app-header-controls">
          <label>
            Country rules
            <select value={country ?? ''} onChange={(e) => setCountry((e.target.value || undefined) as 'FR' | undefined)}>
              <option value="">EN 16931 only</option>
              {complianceCountries.map((c) => (
                <option key={c.country} value={c.country} disabled={!COMPILED_COUNTRIES.has(c.country)}>
                  {c.country === 'FR' ? 'France (BR-FR Flux 2)' : `${c.name} (coming soon)`}
                </option>
              ))}
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

      {isUntouched && (
        <div className="empty-state">
          <p>
            <strong>Start with the invoice below, or drop one in.</strong>
            A downloaded, EN 16931-valid PDF is a few fields away — no account, no server.
          </p>
        </div>
      )}

      {!protectedSince && <ProtectPrompt onProtect={protect} />}

      <InvoiceDropzone onImport={setInvoice} />

      <ValidationSummary
        checking={validation.checking}
        ready={validation.ready}
        totalErrorCount={validation.errorCount}
        issues={visibleIssues(validation, touchedFields)}
        structuralError={validation.structuralError}
        onIssueClick={(key) => goToField(key, touchedFields.markTouched)}
      />

      <div className="mobile-view-toggle" role="tablist" aria-label="Form or preview">
        <button type="button" role="tab" aria-selected={mobileView === 'form'} className={mobileView === 'form' ? 'active' : ''} onClick={() => setMobileView('form')}>
          Form
        </button>
        <button type="button" role="tab" aria-selected={mobileView === 'preview'} className={mobileView === 'preview' ? 'active' : ''} onClick={() => setMobileView('preview')}>
          Preview
        </button>
      </div>

      <div className={`workspace mobile-view-${mobileView}`}>
        <InvoiceEditor
          invoice={invoice}
          onChange={setInvoice}
          validation={validation}
          touchedFields={touchedFields}
          profiles={profiles}
          onSaveProfile={saveProfile}
          onDeleteProfile={deleteProfile}
          paymentLink={paymentLink}
          onPaymentLinkChange={setPaymentLink}
          logo={logo}
          onLogoChange={setLogo}
        />
        <InvoicePreview invoice={invoice} template={template} logo={logo} paymentLink={paymentLink} />
      </div>

      <footer className="app-footer">
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

function ValidationSummary({
  checking,
  ready,
  totalErrorCount,
  issues,
  structuralError,
  onIssueClick,
}: {
  checking: boolean;
  ready: boolean;
  /** The real, unfiltered count — used only to tell "actually passes" apart
   * from "hasn't been touched yet", never shown as a number of its own
   * (Part C: a fresh form must not claim to pass EN 16931 just because
   * nothing has been touched enough to reveal its errors yet). */
  totalErrorCount: number;
  issues: Issue[];
  structuralError?: string;
  onIssueClick: (key: string) => void;
}) {
  if (structuralError) {
    return <p className="validation-summary validation-bad">Can't build this invoice yet: {structuralError}</p>;
  }
  if (!ready) return <p className="validation-summary">Validating…</p>;
  if (totalErrorCount === 0) {
    return <p className="validation-summary validation-ok">✓ Passes EN 16931{checking ? ' (rechecking…)' : ''}</p>;
  }
  if (issues.length === 0) {
    // Real errors exist, but nothing the user has touched (or tried to
    // export) yet — neither a false "passes" nor an alarming red count for
    // a form nobody has started filling in.
    return <p className="validation-summary">Fill in the invoice — checks appear as you leave each field.</p>;
  }
  return (
    <div className="validation-summary validation-bad">
      <p>
        {issues.length} issue{issues.length === 1 ? '' : 's'} to fix{checking ? ' (rechecking…)' : ''}
      </p>
      <ul className="validation-issue-list">
        {issues.map((issue, i) => (
          <li key={i}>
            <button type="button" className="validation-issue" onClick={() => onIssueClick(issue.key)}>
              <span className="field-error-text">{issue.rule.plainLanguage?.summary ?? issue.rule.message}</span>{' '}
              <span className="field-error-rule">{issue.rule.ruleId}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
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
