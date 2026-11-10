import { extractEmbeddedXml, detectXmlFormat } from '@conformo/parse';
import type { Invoice } from '@conformo/core';
import { describePlaces, groupResults, summarizeResult } from '@conformo/validate/page';
import type { RuleGroup, RuleResult, ValidationResult } from '@conformo/validate/page';
import { validateInvoiceXml } from './browserValidator.js';
// The same field-level, plain-language wording as the app (English and German), so both say the same thing about the
// same rule. Imported from the app's source: one table, two pages.
import { describe } from '../../ui/src/validation/messages.js';
import { keyForRule, valueAt } from '../../ui/src/validation/problems.js';
import type { Problem } from '../../ui/src/validation/problems.js';
import { labelFor } from '../../ui/src/validation/labels.js';
import { STRINGS } from '../../ui/src/i18n/strings.js';
import '../../ui/src/index.css';
import '../../ui/src/chrome/site-header.css';
import './style.css';

type Lang = 'en' | 'de';

const S = {
  en: {
    skip: 'Skip to the check',
    tagline: 'Free e-invoices for Germany, France and the EU. No signup. Your data stays with you.',
    navLabel: 'Main', navApp: 'App', navValidator: 'Validator', navDocs: 'Docs', language: 'Language',
    title: 'Will this e-invoice be accepted?',
    lede: 'Drop an invoice and see, in plain words, whether it passes the official rules for its format, and exactly what to fix if not. The check runs in your browser: the file is never uploaded.',
    trust: 'Free, no signup. It uses the official rule files, and its verdicts match the official KoSIT validator 100% on the official test invoices.',
    trustLink: 'See the test results',
    makeText: 'Need to make an e-invoice instead?',
    makeLink: 'Use the free app',
    inputTitle: 'Your invoice',
    dropTitle: 'Drop an e-invoice here',
    dropFormats: 'A PDF with the invoice inside (ZUGFeRD, Factur-X) or an XML file (XRechnung, CII, UBL, Peppol BIS).',
    choose: 'Choose a file',
    pasteToggle: 'Or paste the XML',
    pasteLabel: 'Invoice XML',
    countryLabel: 'Country rules',
    countryDetect: 'Detect from the file',
    countryDE: 'Germany: XRechnung (KoSIT rules)',
    countryFR: 'France: French CTC rules (BR-FR)',
    idleTitle: 'No invoice checked yet',
    idleSub: 'The result appears here as soon as you drop, choose or paste an invoice.',
    checking: 'Checking against the official rules…',
    extracting: 'Reading the invoice inside the PDF…',
    accepted: (std: string) => `Accepted under ${std}`,
    acceptedSub: 'Every official rule for this format passed. No changes needed.',
    rejected: (n: number) => (n === 1 ? '1 problem will get this invoice rejected' : `${n} problems will get this invoice rejected`),
    rejectedSub: (std: string) => `Checked as ${std}. Fix these, then check again:`,
    notInvoice: 'This is not an e-invoice we can read',
    notInvoiceSub: 'Use a ZUGFeRD or Factur-X PDF, or an XRechnung, CII or UBL XML file.',
    xsd: 'The file does not match the official XML schema.',
    conformoCheck: 'Conformo check',
    notes: 'Notes from Conformo (not part of the official rules)',
    technical: 'Technical details',
    rule: 'Rule',
    places: (n: number) => `${n} places`,
    ruleSets: 'Rule sets that ran',
    fired: (f: number, x: number) => `${f} rules applied, ${x} failed`,
    xsdNotRun: 'XML schema (XSD) not checked in the browser',
    warnings: 'Advisories (do not cause rejection)',
    loaded: (name: string) => `Checked: ${name}`,
    footer: 'Apache-2.0. Runs entirely in your browser: no account, no server, no tracking.',
  },
  de: {
    skip: 'Zur Prüfung springen',
    tagline: 'Kostenlose E-Rechnungen für Deutschland, Frankreich und die EU. Ohne Anmeldung. Ihre Daten bleiben bei Ihnen.',
    navLabel: 'Hauptmenü', navApp: 'App', navValidator: 'Prüfen', navDocs: 'Doku', language: 'Sprache',
    title: 'Wird diese E-Rechnung angenommen?',
    lede: 'Legen Sie eine Rechnung ab und sehen Sie in klaren Worten, ob sie die offiziellen Regeln ihres Formats besteht, und was genau zu korrigieren ist. Die Prüfung läuft in Ihrem Browser: Die Datei wird nie hochgeladen.',
    trust: 'Kostenlos, ohne Anmeldung. Geprüft wird mit den offiziellen Regeldateien, und die Ergebnisse stimmen auf den offiziellen Testrechnungen zu 100 % mit dem offiziellen KoSIT-Validator überein.',
    trustLink: 'Zu den Testergebnissen',
    makeText: 'Sie möchten eine E-Rechnung erstellen?',
    makeLink: 'Zur kostenlosen App',
    inputTitle: 'Ihre Rechnung',
    dropTitle: 'E-Rechnung hier ablegen',
    dropFormats: 'Ein PDF mit eingebetteter Rechnung (ZUGFeRD, Factur-X) oder eine XML-Datei (XRechnung, CII, UBL, Peppol BIS).',
    choose: 'Datei auswählen',
    pasteToggle: 'Oder XML einfügen',
    pasteLabel: 'Rechnungs-XML',
    countryLabel: 'Länderregeln',
    countryDetect: 'Aus der Datei erkennen',
    countryDE: 'Deutschland: XRechnung (KoSIT-Regeln)',
    countryFR: 'Frankreich: französische CTC-Regeln (BR-FR)',
    idleTitle: 'Noch keine Rechnung geprüft',
    idleSub: 'Das Ergebnis erscheint hier, sobald Sie eine Rechnung ablegen, auswählen oder einfügen.',
    checking: 'Prüfung gegen die offiziellen Regeln…',
    extracting: 'Rechnung im PDF wird gelesen…',
    accepted: (std: string) => `Gültig nach ${std}`,
    acceptedSub: 'Alle offiziellen Regeln für dieses Format sind erfüllt. Nichts zu ändern.',
    rejected: (n: number) => (n === 1 ? '1 Problem führt zur Ablehnung' : `${n} Probleme führen zur Ablehnung`),
    rejectedSub: (std: string) => `Geprüft als ${std}. Korrigieren Sie diese Punkte und prüfen Sie erneut:`,
    notInvoice: 'Das ist keine lesbare E-Rechnung',
    notInvoiceSub: 'Verwenden Sie ein ZUGFeRD- oder Factur-X-PDF oder eine XRechnung-, CII- oder UBL-XML-Datei.',
    xsd: 'Die Datei entspricht nicht dem offiziellen XML-Schema.',
    conformoCheck: 'Conformo-Prüfung',
    notes: 'Hinweise von Conformo (nicht Teil der offiziellen Regeln)',
    technical: 'Technische Details',
    rule: 'Regel',
    places: (n: number) => `${n} Stellen`,
    ruleSets: 'Geprüfte Regelwerke',
    fired: (f: number, x: number) => `${f} Regeln angewendet, ${x} nicht erfüllt`,
    xsdNotRun: 'XML-Schema (XSD) wird im Browser nicht geprüft',
    warnings: 'Hinweise (führen nicht zur Ablehnung)',
    loaded: (name: string) => `Geprüft: ${name}`,
    footer: 'Apache-2.0. Läuft vollständig in Ihrem Browser: kein Konto, kein Server, kein Tracking.',
  },
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dropzone = $('dropzone');
const fileInput = $<HTMLInputElement>('file-input');
const xmlInput = $<HTMLTextAreaElement>('xml-input');
const countrySelect = $<HTMLSelectElement>('country');
const result = $('result');
const mark = $('result-mark');
const title = $('result-title');
const sub = $('result-sub');
const fixes = $('fixes');
const tech = $<HTMLDetailsElement>('tech');
const techBody = $('tech-body');
const fileName = $('file-name');

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('conformo.lang');
    if (saved === 'en' || saved === 'de') return saved;
  } catch { /* private mode */ }
  return (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase().startsWith('de') ? 'de' : 'en';
}

let lang: Lang = initialLang();
let last: { kind: 'idle' } | { kind: 'busy'; text: string } | { kind: 'error'; message: string } | { kind: 'done'; r: ValidationResult; invoice?: Invoice; name?: string } = { kind: 'idle' };

function applyStatic(): void {
  const t = S[lang] as Record<string, unknown>;
  document.documentElement.lang = lang;
  document.title = lang === 'de' ? 'XRechnung und ZUGFeRD kostenlos prüfen | Conformo' : 'Free XRechnung and ZUGFeRD validator | Conformo';
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n]'))) {
    const v = t[el.dataset.i18n!];
    if (typeof v === 'string') el.textContent = v;
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-i18n-label]'))) {
    const v = t[el.dataset.i18nLabel!];
    if (typeof v === 'string') el.setAttribute('aria-label', v);
  }
  for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lang]'))) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
}

/** The standard named in the verdict, from the rule sets that actually ran. */
function standardOf(r: ValidationResult): string {
  const ids = r.ruleSets.map((x) => x.id);
  if (ids.some((i) => i.startsWith('xrechnung'))) return 'XRechnung 3.0';
  if (ids.includes('peppol-ubl')) return 'Peppol BIS Billing 3.0';
  if (ids.includes('fr-ctc')) return 'EN 16931 + BR-FR';
  return 'EN 16931';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fixItem(rule: RuleResult, invoice: Invoice | undefined, xrechnung: boolean, group?: RuleGroup): string {
  const t = S[lang];
  let field: string | undefined;
  let text = rule.plainLanguage?.summary ?? rule.message;
  let fix = rule.plainLanguage?.fix;
  if (invoice) {
    const key = keyForRule(rule, invoice);
    const empty = (() => { const v = valueAt(invoice, key); return v === undefined || v === null || v === ''; })();
    const p: Problem = { key, kind: empty ? 'missing' : 'invalid', source: 'rules', ruleId: rule.ruleId, official: rule.message, plain: rule.plainLanguage };
    const d = describe(p, lang);
    // A field-specific sentence beats the generic one; the generic fallback only when nothing better exists.
    const generic = /official check rejects this|offizielle Prüfung lehnt/.test(d.text);
    if (!generic) { text = d.text; fix = d.fix; field = labelFor(key, STRINGS[lang], xrechnung); } else if (lang === 'de') { text = rule.message; fix = undefined; }
  }
  return `<li class="vp-fix">
    ${field ? `<p class="vp-fix-field">${esc(field)}</p>` : ''}
    <p class="vp-fix-text">${esc(text)}</p>
    ${fix ? `<p class="vp-fix-how">${esc(fix)}</p>` : ''}
    <p class="vp-fix-rule">${esc(t.rule)} ${esc(rule.ruleId)}${group ? ` · ${esc(t.places(group.count))}: ${esc(describePlaces(group))}` : rule.path ? ` · ${esc(rule.path)}` : ''}${rule.message !== text ? ` · ${esc(rule.message)}` : ''}</p>
  </li>`;
}

function render(): void {
  const t = S[lang];
  fixes.innerHTML = '';
  techBody.innerHTML = '';
  tech.hidden = true;
  if (last.kind === 'idle') {
    result.className = 'seal seal-idle'; mark.textContent = '?';
    title.textContent = t.idleTitle; sub.textContent = t.idleSub;
    return;
  }
  if (last.kind === 'busy') {
    result.className = 'seal seal-checking'; mark.textContent = '…';
    title.textContent = last.text; sub.textContent = '';
    return;
  }
  if (last.kind === 'error') {
    result.className = 'seal seal-bad'; mark.textContent = '!';
    title.textContent = t.notInvoice; sub.textContent = t.notInvoiceSub;
    tech.hidden = false;
    techBody.innerHTML = `<p>${esc(last.message)}</p>`;
    return;
  }
  const { r, invoice, name } = last;
  const std = standardOf(r);
  const failures = r.results.filter((x) => x.severity === 'error' || x.severity === 'fatal');
  const advisories = r.results.filter((x) => x.severity === 'warning' || x.severity === 'info');
  const xsdFailed = r.xsd.ran && r.xsd.valid === false;
  // Conformo's own error checks (e.g. XRECHNUNG-ID-UNKNOWN) reject the file too, so they are counted and listed like rule failures.
  const conformoErrors = r.notices.filter((n) => n.severity === 'error');
  const conformoNotes = r.notices.filter((n) => n.severity !== 'error');
  const count = failures.length + (xsdFailed ? 1 : 0) + conformoErrors.length;
  if (r.valid) {
    result.className = 'seal seal-ok'; mark.textContent = '✓';
    title.textContent = t.accepted(std); sub.textContent = `${name ? `${t.loaded(name)}. ` : ''}${t.acceptedSub}`;
  } else {
    result.className = 'seal seal-bad'; mark.textContent = String(count);
    title.textContent = t.rejected(count); sub.textContent = t.rejectedSub(std);
    fixes.innerHTML = (xsdFailed ? `<li class="vp-fix"><p class="vp-fix-text">${esc(t.xsd)}</p></li>` : '') + conformoErrors.map((n) => `<li class="vp-fix"><p class="vp-fix-text">${esc(n.message)}</p><p class="vp-fix-rule">${esc(t.conformoCheck)} ${esc(n.code)}</p></li>`).join('') + groupResults(failures).map((g) => fixItem(failures.find((x) => x.ruleId === g.ruleId && x.ruleSet === g.ruleSet && x.severity === g.severity)!, invoice, r.ruleSets.some((x) => x.id.startsWith('xrechnung')), g.count > 1 ? g : undefined)).join('');
  }
  tech.hidden = false;
  const sets = r.ruleSets.map((s) => `<li>${esc(s.label)} (${esc(s.source)}): ${esc(t.fired(s.fired, s.failed))}</li>`).join('');
  const xsd = r.xsd.ran ? `<li>XSD ${esc(r.xsd.schema ?? '')}: ${r.xsd.valid ? 'OK' : esc(r.xsd.errors.join('; '))}</li>` : `<li>${esc(t.xsdNotRun)}</li>`;
  const adv = advisories.length
    ? `<p>${esc(t.warnings)}:</p><ul>${groupResults(advisories).map((g) => `<li><strong>${esc(g.ruleId)}</strong> ${esc(g.message)}${g.count > 1 ? ` (${esc(t.places(g.count))}: ${esc(describePlaces(g))})` : ''}</li>`).join('')}</ul>`
    : '';
  const notes = conformoNotes.length
    ? `<p>${esc(t.notes)}:</p><ul>${conformoNotes.map((n) => `<li><strong>${esc(n.code)}</strong> ${esc(n.message)}</li>`).join('')}</ul>`
    : '';
  techBody.innerHTML = `<p>${esc(t.ruleSets)}:</p><ul>${sets}${xsd}</ul>${adv}${notes}`;
}

function set(state: typeof last): void {
  last = state;
  render();
}

/** On a phone the verdict sits below the drop zone: bring it into view once there is one. */
function revealResult(): void {
  if (window.innerWidth > 860) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  result.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

let run = 0;
async function check(xml: string, name?: string): Promise<void> {
  const mine = ++run;
  if (!xml.trim()) { set({ kind: 'idle' }); return; }
  set({ kind: 'busy', text: S[lang].checking });
  try {
    const country = countrySelect.value as 'FR' | 'DE' | '';
    const r = await validateInvoiceXml(xml, country ? { country } : {});
    r.summary = summarizeResult(r);
    let invoice: Invoice | undefined;
    try { invoice = detectXmlFormat(xml).invoice; } catch { invoice = undefined; }
    if (mine === run) {
      set({ kind: 'done', r, invoice, name });
      revealResult();
    }
  } catch (err) {
    if (mine === run) set({ kind: 'error', message: (err as Error).message });
  }
}

async function handleFile(file: File): Promise<void> {
  // Old results go the moment a new file arrives, never shown next to the new file's name.
  const mine = ++run;
  fileName.textContent = file.name;
  set({ kind: 'busy', text: S[lang].checking });
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let xml: string;
    if (bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-') {
      set({ kind: 'busy', text: S[lang].extracting });
      xml = (await extractEmbeddedXml(bytes)).xml;
    } else {
      xml = new TextDecoder().decode(bytes);
    }
    if (mine !== run) return;
    xmlInput.value = xml;
    await check(xml, file.name);
  } catch (err) {
    if (mine === run) set({ kind: 'error', message: (err as Error).message });
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void handleFile(file);
  fileInput.value = '';
});
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('active'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('active'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('active');
  const file = e.dataTransfer?.files?.[0];
  if (file) void handleFile(file);
});
let pasteTimer: ReturnType<typeof setTimeout> | undefined;
xmlInput.addEventListener('input', () => {
  fileName.textContent = '';
  clearTimeout(pasteTimer);
  set(xmlInput.value.trim() ? { kind: 'busy', text: S[lang].checking } : { kind: 'idle' });
  pasteTimer = setTimeout(() => void check(xmlInput.value), 500);
});
countrySelect.addEventListener('change', () => { if (xmlInput.value.trim()) void check(xmlInput.value, fileName.textContent || undefined); });
for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lang]'))) {
  b.addEventListener('click', () => {
    lang = b.dataset.lang as Lang;
    try { localStorage.setItem('conformo.lang', lang); } catch { /* ignore */ }
    applyStatic();
    render();
  });
}

applyStatic();
render();
