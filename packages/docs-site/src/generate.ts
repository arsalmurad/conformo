/**
 * Generates one static HTML page per mandate country from
 * @conformo/compliance-data, plus an index. "So it cannot drift"
 * : there is no hand-written country page
 * anywhere in this package, only this generator and the dataset it reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countries, dataset } from '@conformo/compliance-data';
import type { CountryCompliance, Mandate, MandateStatus } from '@conformo/compliance-data';
import { page } from './layout.js';

// Resolved from this file's own location, not process.cwd() — this script
// must produce the same output whether run as `npm run build` (cwd is this
// package) or imported directly, e.g. by test/docs-site.test.ts (cwd is the
// repo root).
const OUT = fileURLToPath(new URL('../dist', import.meta.url));

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const BADGE_LABEL: Record<MandateStatus, string> = {
  mandatory: 'Mandatory',
  planned: 'Planned',
  delayed: 'Delayed',
  voluntary: 'No mandate',
  unverified: 'Unverified',
};

function badge(status: MandateStatus): string {
  return `<span class="badge badge-${status}">${BADGE_LABEL[status]}</span>`;
}

function mandateRow(m: Mandate): string {
  const when = m.effectiveDate ? esc(m.effectiveDate) : (m.thresholdNote ? '' : '—');
  return `<tr>
    <td>${esc(m.scope)}</td>
    <td>${badge(m.status)}</td>
    <td>${when}${m.thresholdNote ? `<div class="lede">${esc(m.thresholdNote)}</div>` : ''}</td>
    <td>${m.requiredFormats.map(esc).join(', ')}${m.platform ? `<div class="lede">${esc(m.platform)}</div>` : ''}</td>
  </tr>`;
}

function countryPage(c: CountryCompliance): string {
  const body = `
<h1>${esc(c.name)}</h1>
<p class="lede">ISO ${esc(c.country)}${c.ruleSetVersion ? ` · Rule set: ${esc(c.ruleSetVersion)}` : ''}</p>

<h2>Mandates</h2>
<table>
  <thead><tr><th>Scope</th><th>Status</th><th>Effective</th><th>Format(s)</th></tr></thead>
  <tbody>${c.mandates.map(mandateRow).join('')}</tbody>
</table>

${c.extraFieldsBeyondEN16931?.length ? `
<h2>Beyond EN 16931</h2>
<ul>${c.extraFieldsBeyondEN16931.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
` : ''}

<div class="source-note">
  Source: <a href="${esc(c.sourceUrl)}">${esc(c.sourceUrl)}</a><br>
  Last verified: ${esc(c.lastVerified)} ·
  <span class="badge badge-${c.status === 'verified' ? 'mandatory' : 'unverified'}">${c.status === 'verified' ? 'Verified' : 'Unverified'}</span>
</div>
`;
  return page({ title: c.name, description: `E-invoicing mandate status for ${c.name}.`, active: 'countries', depth: 1 }, body);
}

function countriesIndexPage(): string {
  // Same directory as the country pages this links to — no "../" needed.
  const items = [...countries].sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `<li><a href="${c.country.toLowerCase()}.html">${esc(c.name)}</a></li>`).join('');
  const body = `
<h1>Countries</h1>
<p class="lede">${countries.length} countries, sourced from a tax authority, ministry, or official EU page. Dataset last verified ${esc(dataset.generatedAt)}.</p>
<ul class="country-grid">${items}</ul>
`;
  return page({ title: 'Countries', description: 'E-invoicing mandate status by country.', active: 'countries', depth: 1 }, body);
}

function homePage(): string {
  const body = `
<h1>Conformo</h1>
<p class="lede">The open-source invoice tool that produces legally valid electronic invoices,
not just good-looking PDFs. EN 16931 semantic model, serialized to Factur-X,
ZUGFeRD, XRechnung, UBL 2.1 and Peppol BIS, validated live against the
official CEN Schematron plus each country's CIUS rules.</p>
<h2>Where to start</h2>
<ul>
  <li><a href="countries/index.html">Compliance status by country</a> — generated from a sourced dataset.</li>
  <li><a href="https://github.com/arsalmurad/conformo">Source on GitHub</a></li>
  <li><a href="https://github.com/arsalmurad/conformo/blob/main/CONTRIBUTING.md">Contributing</a></li>
</ul>
`;
  return page({ title: 'Home', description: 'Legally valid electronic invoices, EN 16931, Factur-X, XRechnung, UBL, Peppol.', active: 'home', depth: 0 }, body);
}

function write(relPath: string, html: string): void {
  const full = path.join(OUT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html);
}

fs.rmSync(OUT, { recursive: true, force: true });
write('index.html', homePage());
write('countries/index.html', countriesIndexPage());
for (const c of countries) {
  write(`countries/${c.country.toLowerCase()}.html`, countryPage(c));
}
console.log(`docs-site: wrote ${countries.length + 2} pages to ${OUT}/`);
