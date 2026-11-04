import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Invoice } from '@conformo/core';
import type { TemplateId } from '@conformo/pdf';
import { TEMPLATES, isPdfLanguage, type PdfLanguage } from '@conformo/pdf';
import { AUDIENCES, applyAudience, defaultAudience, isAudienceId, type AudienceId } from './audience.js';
import { useI18n } from './i18n/I18n.js';
import { labelFor } from './validation/labels.js';
import { useInvoiceDraft } from './state/useInvoiceDraft.js';
import { emptyInvoice } from './state/emptyInvoice.js';
import { useLiveValidation } from './validation/useLiveValidation.js';
import { useTouchedFields } from './validation/useTouchedFields.js';
import { describe, type Described } from './validation/messages.js';
import type { Problem } from './validation/problems.js';
import { useComplianceCountries } from './useComplianceCountries.js';
import { useNumbering } from './numbering/useNumbering.js';
import { recordIssuedNumber } from './numbering/localCounter.js';
import { InvoiceEditor } from './editor/InvoiceEditor.js';
import { NotesField } from './editor/NotesField.js';
import { BillingPanel } from './editor/BillingPanel.js';
import { PaymentLinkField } from './editor/PaymentLinkField.js';
import { LogoUpload } from './editor/LogoUpload.js';
import { fieldId } from './editor/Field.js';
import { InvoicePreview } from './preview/InvoicePreview.js';
import { buildDraftPdf, buildInvoicePdf, downloadPdf, type EmbeddableLogo } from './pdf/exportPdf.js';
import { UnlockScreen } from './UnlockScreen.js';
import { LINKS, SiteHeader } from './chrome/SiteHeader.js';
import { AudiencePicker } from './chrome/AudiencePicker.js';
import { MoreMenu } from './chrome/MoreMenu.js';
import { Verdict } from './chrome/Verdict.js';
import './chrome/site-header.css';
import './App.css';

const AUDIENCE_KEY = 'conformo.audience';
const PDF_LANGUAGE_KEY = 'conformo.pdfLanguage';

/** Names of the page languages, each in its own language, so they read the same whatever the app language is. */
const PDF_LANGUAGE_NAMES: Record<PdfLanguage, string> = { de: 'Deutsch', en: 'English', fr: 'Français' };

function savedPdfLanguage(): PdfLanguage | undefined {
  try {
    const saved = localStorage.getItem(PDF_LANGUAGE_KEY);
    return isPdfLanguage(saved) ? saved : undefined;
  } catch { return undefined; /* private mode */ }
}

function initialAudience(): AudienceId {
  try {
    const saved = localStorage.getItem(AUDIENCE_KEY);
    if (isAudienceId(saved)) return saved;
  } catch { /* private mode */ }
  return defaultAudience(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []);
}

export default function App() {
  const { t, lang } = useI18n();
  const [audienceId, setAudienceId] = useState<AudienceId>(initialAudience);
  const audience = AUDIENCES[audienceId];
  const draft = useInvoiceDraft(() => applyAudience(emptyInvoice(AUDIENCES[audienceId].defaultSellerCountry, AUDIENCES[audienceId].defaultBuyerCountry), AUDIENCES[audienceId]));
  const { invoice, setInvoice, profiles, saveProfile, deleteProfile, lock, protectedSince, protect, unlock, discardLockedDraft } = draft;
  const [template, setTemplate] = useState<TemplateId>('classic');
  // The printed labels follow the app language until the user picks one; that choice is remembered on this device.
  const [pdfLanguageChoice, setPdfLanguageChoice] = useState<PdfLanguage | undefined>(savedPdfLanguage);
  const pdfLanguage: PdfLanguage = pdfLanguageChoice ?? lang;
  const [busy, setBusy] = useState<'pdf' | 'draft' | undefined>();
  const [paymentLink, setPaymentLink] = useState('');
  const [logo, setLogo] = useState<EmbeddableLogo | undefined>(undefined);
  const [mobileView, setMobileView] = useState<'form' | 'preview'>('form');
  const validation = useLiveValidation(invoice, audience);
  const touched = useTouchedFields();
  const countries = useComplianceCountries();
  const numbering = useNumbering();
  const isB2G = audienceId === 'de-b2g';

  const chooseAudience = useCallback((id: AudienceId) => {
    setAudienceId(id);
    try { localStorage.setItem(AUDIENCE_KEY, id); } catch { /* ignore */ }
    setInvoice((inv: Invoice) => applyAudience(inv, AUDIENCES[id]));
  }, [setInvoice]);

  // Errors appear only for a field the user has left, or everywhere after a download attempt. 'lines'/'totals' are
  // computed, so they follow the line fields.
  const shown = useCallback((key: string) => {
    if (touched.isVisible(key)) return true;
    if (key === 'lines' || key === 'totals') return touched.isVisible('lines.0.name') || touched.isVisible('lines.0.unitPriceMinor');
    return false;
  }, [touched]);

  const visible = useMemo(() => validation.problems.filter((p) => shown(p.key)), [validation.problems, shown]);
  const byKey = useMemo(() => new Map<string, Problem>(visible.map((p) => [p.key, p])), [visible]);
  const errorFor = useCallback((key: string): Described | undefined => {
    const p = byKey.get(key);
    return p ? describe(p, lang) : undefined;
  }, [byKey, lang]);

  const goTo = useCallback((key: string) => {
    touched.markTouched(key);
    setMobileView('form');
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldId(key)) ?? document.querySelector<HTMLElement>(`[data-field="${key}"]`);
      if (!el) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    });
  }, [touched]);

  useEffect(() => {
    if (lock.status === 'unlocked') document.title = lang === 'de' ? 'Conformo: E-Rechnung erstellen' : 'Conformo: make an e-invoice';
  }, [lang, lock.status]);

  if (lock.status === 'checking') return null;
  if (lock.status === 'locked' || lock.status === 'wrong-passphrase') {
    return <UnlockScreen wrongPassphrase={lock.status === 'wrong-passphrase'} onUnlock={unlock} onDiscard={discardLockedDraft} />;
  }

  const problems = validation.problems;
  const allMissingAll = problems.every((p) => p.kind === 'missing');
  const draftLabel = t.actions.downloadDraft(audience.standard);
  const options = { logo, paymentLink: paymentLink || undefined, language: pdfLanguage };

  async function downloadEInvoice() {
    setBusy('pdf');
    try {
      const bytes = await buildInvoicePdf(invoice, template, options, audience.profile);
      downloadPdf(bytes, `${invoice.number || 'invoice'}.pdf`);
      if (invoice.number) void recordIssuedNumber(invoice.number).catch(() => {});
    } finally {
      setBusy(undefined);
    }
  }

  async function downloadDraft() {
    setBusy('draft');
    try {
      const stamp = { de: 'ENTWURF', en: 'DRAFT', fr: 'BROUILLON' }[pdfLanguage];
      const notice = {
        de: `Entwurf: keine gültige E-Rechnung (${audience.standard})`,
        en: `Draft: not a valid e-invoice (${audience.standard})`,
        fr: `Brouillon : pas une facture électronique valide (${audience.standard})`,
      }[pdfLanguage];
      const bytes = await buildDraftPdf(invoice, template, options, stamp, notice);
      downloadPdf(bytes, `${invoice.number || 'invoice'}-draft.pdf`);
    } finally {
      setBusy(undefined);
    }
  }

  function chooseLanguage(value: string) {
    if (!isPdfLanguage(value)) return;
    setPdfLanguageChoice(value);
    try { localStorage.setItem(PDF_LANGUAGE_KEY, value); } catch { /* private mode */ }
  }

  function fixFirst() {
    touched.revealAll();
    const first = problems[0];
    if (first) goTo(first.key);
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

  const ready = validation.accepted && !validation.checking && problems.length === 0;
  const allMissing = problems.length > 0 && problems.every((p) => p.kind === 'missing');
  let primary: React.ReactNode;
  if (busy === 'pdf') primary = <button type="button" className="btn btn-primary" disabled>{t.actions.building}</button>;
  else if (ready) primary = <button type="button" className="btn btn-primary" onClick={() => void downloadEInvoice()}>{t.actions.download}</button>;
  else if (problems.length > 0) primary = <button type="button" className="btn btn-primary" onClick={fixFirst}>{allMissing ? t.actions.complete(problems.length) : t.actions.fix(problems.length)}</button>;
  else primary = <button type="button" className="btn btn-primary" disabled>{t.actions.checking}</button>;

  return (
    <div className="app">
      <a className="skip-link" href="#editor-start">{lang === 'de' ? 'Zum Formular springen' : 'Skip to the form'}</a>
      <SiteHeader current="app" />
      <div className="view-toggle" role="group" aria-label={`${t.actions.form} / ${t.actions.preview}`}>
        <button type="button" aria-pressed={mobileView === 'form'} onClick={() => setMobileView('form')}>{t.actions.form}</button>
        <button type="button" aria-pressed={mobileView === 'preview'} onClick={() => setMobileView('preview')}>
          {t.actions.preview}
          {problems.length > 0 && (
            <>
              <span className="view-toggle-count" aria-hidden="true">{problems.length}</span>
              <span className="visually-hidden">{`: ${allMissingAll ? t.verdict.incomplete(problems.length) : t.verdict.problems(problems.length)}`}</span>
            </>
          )}
        </button>
      </div>
      <main className={`workspace view-${mobileView}`}>
        <div className="form-col" id="editor-start">
          <div className="intro">
            <h1 className="intro-title">{t.intro.title}</h1>
            <p className="intro-lede">
              {t.intro.lede} <a href={`${LINKS.docs}conformance.html`}>{t.intro.proof}</a>
            </p>
          </div>
          <div className="form-top">
            <AudiencePicker value={audienceId} onChange={chooseAudience} countries={countries} />
            <MoreMenu invoice={invoice} onImport={setInvoice} onExportJson={exportJson} protectedSince={protectedSince} onProtect={protect} numbering={numbering} />
          </div>
          <InvoiceEditor
            invoice={invoice}
            onChange={setInvoice}
            audience={audience}
            errorFor={errorFor}
            onTouch={touched.markTouched}
            numbering={numbering}
            profiles={profiles}
            onSaveProfile={saveProfile}
            onDeleteProfile={deleteProfile}
          />
          <details className="section extras">
            <summary><h2>{t.sections.extras}</h2></summary>
            <NotesField invoice={invoice} onChange={setInvoice} />
            <BillingPanel invoice={invoice} onChange={setInvoice} />
            <PaymentLinkField value={paymentLink} onChange={setPaymentLink} />
            <LogoUpload logo={logo} onChange={setLogo} />
          </details>
        </div>
        <div className="preview-col">
          <Verdict audience={audience} validation={validation} visible={visible} labelFor={(k) => labelFor(k, t, isB2G)} onGo={goTo} />
          <InvoicePreview invoice={invoice} template={template} logo={logo} paymentLink={paymentLink} language={pdfLanguage}>
            <div className="preview-tools">
              <label htmlFor="template-select">{t.fields.template}</label>
              <select id="template-select" value={template} onChange={(e) => setTemplate(e.target.value as TemplateId)}>
                {Object.entries(TEMPLATES).map(([id, tpl]) => <option key={id} value={id}>{tpl.label}</option>)}
              </select>
              <label htmlFor="pdf-language-select">{t.fields.pdfLanguage}</label>
              <select id="pdf-language-select" value={pdfLanguage} onChange={(e) => chooseLanguage(e.target.value)}>
                {(Object.keys(PDF_LANGUAGE_NAMES) as PdfLanguage[]).map((l) => <option key={l} value={l} lang={l}>{PDF_LANGUAGE_NAMES[l]}</option>)}
              </select>
            </div>
          </InvoicePreview>
        </div>
      </main>
      <div className="action-bar">
        <div className="action-bar-inner">
          {problems.length > 0 && !ready && (
            <button type="button" className="btn btn-quiet" onClick={() => void downloadDraft()} disabled={busy !== undefined}>
              {busy === 'draft' ? t.actions.building : draftLabel}
            </button>
          )}
          {primary}
        </div>
      </div>
      <footer className="app-footer">{t.footer}</footer>
    </div>
  );
}
