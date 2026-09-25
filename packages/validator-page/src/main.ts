import { extractEmbeddedXml } from '@conformo/parse';
import type { RuleResult } from '@conformo/validate/browser';
import { validateInvoiceXml } from './browserValidator.js';

const dropzone = document.getElementById('dropzone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const xmlInput = document.getElementById('xml-input') as HTMLTextAreaElement;
const countrySelect = document.getElementById('country') as HTMLSelectElement;
const validateBtn = document.getElementById('validate-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const rulesEl = document.getElementById('rules')!;
const fileNameEl = document.getElementById('file-name')!;

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
}

async function handleFile(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isPdf(bytes)) {
    setStatus('Extracting embedded XML…', undefined);
    const { xml, filename } = await extractEmbeddedXml(bytes);
    xmlInput.value = xml;
    setStatus(`Extracted ${filename} from ${file.name}.`, undefined);
  } else {
    xmlInput.value = new TextDecoder().decode(bytes);
    setStatus(`Loaded ${file.name}.`, undefined);
  }
}

function setStatus(text: string, ok: boolean | undefined): void {
  statusEl.textContent = text;
  statusEl.className = ok === undefined ? '' : ok ? 'ok' : 'bad';
}

function renderRules(results: RuleResult[]): void {
  rulesEl.innerHTML = '';
  for (const r of results) {
    const li = document.createElement('li');
    li.className = r.severity;
    const fields = r.fields.length ? ` (${r.fields.join(', ')})` : '';
    li.innerHTML = `<span class="rule-id">[${r.severity.toUpperCase()}] ${escapeHtml(r.ruleId)}${escapeHtml(fields)}</span>
      <div>${escapeHtml(r.message)}</div>
      ${r.plainLanguage ? `<div class="why">${escapeHtml(r.plainLanguage.why)} — ${escapeHtml(r.plainLanguage.fix)}</div>` : ''}`;
    rulesEl.appendChild(li);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function runValidation(): Promise<void> {
  const xml = xmlInput.value.trim();
  if (!xml) {
    setStatus('Drop a file or paste XML first.', false);
    return;
  }
  validateBtn.disabled = true;
  rulesEl.innerHTML = '';
  setStatus('Validating…', undefined);
  try {
    const country = countrySelect.value as 'FR' | '';
    const result = await validateInvoiceXml(xml, country);
    const failures = result.results.filter((r) => r.severity === 'error' || r.severity === 'fatal');
    setStatus(
      result.valid
        ? `Valid — ${result.firedCount} rules checked, 0 failed.`
        : `Invalid — ${result.firedCount} rules checked, ${failures.length} failed.`,
      result.valid,
    );
    renderRules([...failures, ...result.results.filter((r) => r.severity === 'warning' || r.severity === 'info')]);
  } catch (err) {
    setStatus((err as Error).message, false);
  } finally {
    validateBtn.disabled = false;
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) {
    fileNameEl.textContent = file.name;
    void handleFile(file);
  }
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('active');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('active'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('active');
  const file = e.dataTransfer?.files?.[0];
  if (file) void handleFile(file);
});

validateBtn.addEventListener('click', () => void runValidation());
