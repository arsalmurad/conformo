/**
 * Generates the developer docs site: pages rendered from this repository's own Markdown (the same files the doc-tests
 * and test/docs-site-samples.test.ts execute, so a sample on the site is a sample a test ran), the conformance
 * figures read from docs/CONFORMANCE.md, and one page per country from @conformo/compliance-data. Nothing here is
 * hand-written HTML content that could drift from its source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countries, dataset } from '@conformo/compliance-data';
import type { CountryCompliance, Mandate, MandateStatus } from '@conformo/compliance-data';
import { DOCS_CSS, page, SITE } from './layout.js';
import { esc, renderMarkdown } from './markdown.js';
import { PAGES } from './pages.js';
import { SITES, writeBrandFiles } from '../../ui/brand/brand.mjs';

// Resolved from this file's location, not process.cwd(): `npm run build` (cwd: this package) and the test that imports
// this module (cwd: repo root) must produce the same output.
const OUT = fileURLToPath(new URL('../dist', import.meta.url));
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const GITHUB_BLOB = `${SITE.github}/blob/main/`;


function linker(srcRel: string, depth: 0 | 1) {
  const root = depth === 0 ? '.' : '..';
  return (href: string): string => {
    if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return href;
    const [p, hash] = href.split('#');
    const repoPath = path.posix.normalize(path.posix.join(path.posix.dirname(srcRel), p!));
    const target = PAGES.find((x) => x.src === repoPath);
    if (target) return `${root}/${target.out}${hash ? `#${hash}` : ''}`;
    if (repoPath === 'docs/openapi.json') return `${root}/openapi.json`;
    return `${GITHUB_BLOB}${repoPath}${hash ? `#${hash}` : ''}`;
  };
}

// ------------------------------------------------------------------ generated sections

const BADGE_LABEL: Record<MandateStatus, string> = {
  mandatory: 'Mandatory', planned: 'Planned', delayed: 'Delayed', voluntary: 'No mandate', unverified: 'Unverified',
};
const badge = (status: MandateStatus) => `<span class="badge badge-${status}">${BADGE_LABEL[status]}</span>`;

/** The formats the web app writes; the library also writes UBL and Peppol BIS (see the country pages). */
const APP_FORMATS = new Set(['cii', 'factur-x', 'zugferd', 'xrechnung']);
const LIB_FORMATS = new Set([...APP_FORMATS, 'ubl-2.1', 'peppol-bis-3.0']);

function b2bSend(c: CountryCompliance): Mandate | undefined {
  return c.mandates.filter((m) => m.scope === 'B2B' && (m.direction === 'send' || m.direction === 'both'))
    .sort((a, b) => (a.effectiveDate ?? '9999').localeCompare(b.effectiveDate ?? '9999'))[0];
}

function countryTable(depth: 0 | 1): string {
  const root = depth === 0 ? '.' : '..';
  const rows = [...countries].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
    const m = b2bSend(c);
    const formats = new Set(c.mandates.flatMap((x) => x.requiredFormats));
    const lib = [...formats].some((f) => LIB_FORMATS.has(f));
    const app = [...formats].some((f) => APP_FORMATS.has(f));
    return `<tr><td><a href="${root}/countries/${c.country.toLowerCase()}.html">${esc(c.name)}</a></td>
      <td>${m ? `${badge(m.status)} ${m.effectiveDate ? esc(m.effectiveDate) : ''}` : '<span class="muted">none listed</span>'}</td>
      <td>${[...formats].map(esc).join(', ')}</td>
      <td>${lib ? '<span class="badge badge-yes">Library</span>' : '<span class="badge badge-no">Not yet</span>'} ${app ? '<span class="badge badge-yes">Web app</span>' : ''}</td></tr>`;
  }).join('');
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table><thead><tr><th>Country</th><th>B2B issuing</th><th>Formats</th><th>Conformo</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted">From <code>packages/compliance-data</code>: every fact has an official source, last verified ${esc(dataset.generatedAt)}. Not legal advice.</p>`;
}

/** The KoSIT figures and the overall agreement, read from the generated report (never typed in by hand). */
function conformanceFigures(depth: 0 | 1): string {
  const md = fs.readFileSync(path.join(ROOT, 'docs/CONFORMANCE.md'), 'utf-8');
  const row = (name: string) => md.split('\n').find((l) => l.startsWith(`| ${name}`))?.split('|').map((c) => c.trim());
  const kosit = row('KoSIT XRechnung test suite');
  const cen = row('CEN EN 16931 example files');
  const overall = /Overall reference agreement: \*\*([^*]+)\*\*/.exec(md)?.[1];
  const ratio = (cells: string[] | undefined, col: number) => cells?.[col]?.split(' ')[0] ?? 'n/a';
  const root = depth === 0 ? '.' : '..';
  return `<div class="figures">
  <div class="figure"><b>${esc(ratio(kosit, 6))}</b><span>KoSIT XRechnung test suite: same verdict as the official KoSIT validator</span></div>
  <div class="figure"><b>${esc(ratio(cen, 6))}</b><span>CEN EN 16931 examples: same verdict as KoSIT</span></div>
  <div class="figure"><b>${esc(overall?.split(' ')[0] ?? 'n/a')}</b><span>official sample files where our rule results equal the publishers' own XSLT</span></div>
</div>
<p class="muted">From <a href="${root}/conformance.html">the conformance report</a>, regenerated by <code>npm run conformance</code> on every CI run.</p>`;
}

function homeExtras(): string {
  const cards: [string, string, string][] = [
    ['library.html', 'npm library', 'createXml, createPdf, validate, convert, parse'],
    ['cli.html', 'CLI', 'conformo create / validate / convert'],
    ['mcp.html', 'MCP server', 'Claude Desktop, Claude Code, Cursor'],
    ['http.html', 'HTTP API', 'For PHP, Python, Java back ends; OpenAPI 3.1'],
    ['germany-2027.html', 'Germany 2027', 'What the mandate requires, with code'],
    ['limits.html', 'Not done yet', 'What Conformo does not do, said plainly'],
  ];
  return `
<h2 id="start">Pick your way in</h2>
<ul class="cards">${cards.map(([href, t, s]) => `<li><a href="./${href}"><strong>${t}</strong><span>${s}</span></a></li>`).join('')}</ul>
<p>Not a developer? <a href="${SITE.app}">Make an invoice in the app</a> or <a href="${SITE.validator}">check one you received</a>. Both run in your browser.</p>
<h2 id="proof">Shown, not claimed</h2>
${conformanceFigures(0)}
<h2 id="countries">Country status</h2>
${countryTable(0)}
`;
}

// ------------------------------------------------------------------ country pages (from the dataset)

function mandateRow(m: Mandate): string {
  const when = m.effectiveDate ? esc(m.effectiveDate) : (m.thresholdNote ? '' : '—');
  return `<tr><td>${esc(m.scope)}</td><td>${badge(m.status)}</td>
    <td>${when}${m.thresholdNote ? `<div class="muted">${esc(m.thresholdNote)}</div>` : ''}</td>
    <td>${m.requiredFormats.map(esc).join(', ')}${m.platform ? `<div class="muted">${esc(m.platform)}</div>` : ''}</td></tr>`;
}

function countryPage(c: CountryCompliance): string {
  const body = `
<h1>${esc(c.name)}</h1>
<p class="lead">ISO ${esc(c.country)}${c.ruleSetVersion ? ` · Rule set: ${esc(c.ruleSetVersion)}` : ''}</p>
<h2>Mandates</h2>
<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table>
  <thead><tr><th>Scope</th><th>Status</th><th>Effective</th><th>Format(s)</th></tr></thead>
  <tbody>${c.mandates.map(mandateRow).join('')}</tbody>
</table></div>
${c.extraFieldsBeyondEN16931?.length ? `<h2>Beyond EN 16931</h2><ul>${c.extraFieldsBeyondEN16931.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
<div class="source-note">
  Source: <a href="${esc(c.sourceUrl)}">${esc(c.sourceUrl)}</a><br>
  Last verified: ${esc(c.lastVerified)} ·
  <span class="badge badge-${c.status === 'verified' ? 'mandatory' : 'unverified'}">${c.status === 'verified' ? 'Verified' : 'Unverified'}</span>
</div>`;
  return page({ title: `E-invoicing in ${c.name}`, description: `E-invoicing rules in ${c.name}: B2G and B2B mandates for issuing and receiving, start dates, thresholds and required formats, with official sources.`, path: `countries/${c.country.toLowerCase()}.html`, active: 'countries', depth: 1 }, body);
}

function countriesIndexPage(): string {
  const items = [...countries].sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `<li><a href="${c.country.toLowerCase()}.html">${esc(c.name)}</a></li>`).join('');
  const body = `
<h1>Countries</h1>
<p class="lead">${countries.length} countries, each fact sourced from a tax authority, ministry or official EU page. Dataset last verified ${esc(dataset.generatedAt)}.</p>
<ul class="country-grid">${items}</ul>
<h2>At a glance</h2>
${countryTable(1)}`;
  return page({ title: 'E-invoicing mandates by country', description: 'Who must send and receive e-invoices in each EU country, from when, and in which formats, with official sources.', path: 'countries/index.html', active: 'countries', depth: 1 }, body);
}

// ------------------------------------------------------------------ write

function write(relPath: string, content: string | Buffer): void {
  const full = path.join(OUT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function css(): string {
  // The app's own tokens and header, with the font URLs made relative to assets/ (the site may live on a subpath).
  const tokens = fs.readFileSync(path.join(ROOT, 'packages/ui/src/index.css'), 'utf-8').replace(/url\('\/assets\/fonts\//g, "url('fonts/");
  const header = fs.readFileSync(path.join(ROOT, 'packages/ui/src/chrome/site-header.css'), 'utf-8');
  return `${tokens}\n${header}\n${DOCS_CSS}`;
}

fs.rmSync(OUT, { recursive: true, force: true });
write('assets/site.css', css());
for (const f of ['WorkSans-Regular.ttf', 'WorkSans-Bold.ttf']) write(`assets/fonts/${f}`, fs.readFileSync(path.join(ROOT, 'packages/ui/public/assets/fonts', f)));
write('openapi.json', fs.readFileSync(path.join(ROOT, 'docs/openapi.json')));

for (const p of PAGES) {
  const md = fs.readFileSync(path.join(ROOT, p.src), 'utf-8');
  const r = renderMarkdown(md, { link: linker(p.src, 0) });
  let body = r.html;
  if (p.key === 'home') body += homeExtras();
  if (p.key === 'conformance') body = body.replace(/<\/h1>/, `</h1>\n${conformanceFigures(0)}`);
  const jsonLd = p.key === 'home' ? {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: 'Conformo',
    description: p.description,
    url: SITE.docs,
    codeRepository: SITE.github,
    programmingLanguage: ['TypeScript', 'JavaScript'],
    runtimePlatform: 'Node.js 20 or newer, or a web browser',
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
    author: { '@type': 'Person', name: 'Muhammad Arsal Murad', url: 'https://github.com/arsalmurad' },
  } : undefined;
  write(p.out, page({ title: p.key === 'home' ? 'XRechnung and ZUGFeRD for JavaScript developers' : r.title, description: p.description, path: p.out, active: p.key, depth: 0, ...(jsonLd ? { jsonLd } : {}) }, body));
}
write('countries/index.html', countriesIndexPage());
for (const c of countries) write(`countries/${c.country.toLowerCase()}.html`, countryPage(c));
// Icons, the social card, robots.txt and a sitemap of every page written above (packages/ui/brand/brand.mjs).
const sitemapPages = [...PAGES.map((p) => (p.out === 'index.html' ? '' : p.out)), 'countries/index.html', ...countries.map((c) => `countries/${c.country.toLowerCase()}.html`)];
writeBrandFiles(OUT, { siteUrl: SITES.docs, pages: sitemapPages });
console.log(`docs-site: wrote ${PAGES.length + countries.length + 1} pages to ${OUT}/`);
