/**
 * Conformance run: our runtime validator against the official validators, on the official sample corpora.
 *
 *   npm run conformance            writes docs/CONFORMANCE.md (+ out/conformance/results.json)
 *   npm run conformance -- --strict  exits 1 on any mismatch that has no entry in explanations.json
 *
 * Per file it measures
 *   (a) agreement with the reference: Saxon-HE running the SAME publisher XSLT (tools/conformance/oracle.py) and
 *       lxml for the XSD: same failed rule ids per rule set, same XSD verdict;
 *   (b) agreement with the official KoSIT validator (java -jar, XRechnung and plain EN 16931 scenarios) when Java is present;
 *   (c) round trip: parse -> model -> re-serialize in the same syntax -> re-validate, then compare the model read
 *       back with the first read (fixed point) and the document's stated totals with totals(model).
 * The report has no timestamps, so CI can regenerate it and fail on a diff.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { totals } from '../../packages/core/src/index.js';
import type { Invoice } from '../../packages/core/src/index.js';
import { buildCII, buildUBL } from '../../packages/formats/src/index.js';
import { detectXmlFormat, parseXml, child, children, descend, text } from '../../packages/parse/src/index.js';
import { validate, planRulesets, ValidationInputError } from '../../packages/validate/src/index.js';
import type { ValidationResult } from '../../packages/validate/src/index.js';
// @ts-expect-error plain .mjs helpers shared with the build scripts
import { artefactDir, manifest } from '../fetch-artefacts.mjs';
// @ts-expect-error plain .mjs helper
import { rulesetSources } from '../rulesets-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'out/conformance');
const strict = process.argv.includes('--strict');
const quick = process.argv.includes('--quick'); // first 15 files per corpus, for local iteration only

interface Corpus { id: string; title: string; source: string; roots: string[]; roundtrip: boolean }
const corpora: Corpus[] = [
  { id: 'kosit-testsuite', title: 'KoSIT XRechnung test suite', source: `itplr-kosit/xrechnung-testsuite ${manifest.artefacts['xrechnung-testsuite'].version}`, roots: [path.join(artefactDir('xrechnung-testsuite'), 'src/test')], roundtrip: true },
  { id: 'peppol-examples', title: 'Peppol BIS Billing 3.0 examples', source: `OpenPEPPOL/peppol-bis-invoice-3 ${manifest.artefacts['peppol-bis-3'].version}`, roots: [path.join(artefactDir('peppol-bis-3'), 'rules/examples')], roundtrip: true },
  { id: 'cen-examples', title: 'CEN EN 16931 example files', source: `ConnectingEurope/eInvoicing-EN16931 ${manifest.artefacts['cen-en16931'].version}`, roots: ['ubl/examples', 'cii/examples', 'test/testfiles'].map((d) => path.join(artefactDir('cen-en16931'), d)), roundtrip: true },
  { id: 'cen-unit-tests', title: 'CEN EN 16931 rule unit tests (one failing document per rule)', source: `ConnectingEurope/eInvoicing-EN16931 ${manifest.artefacts['cen-en16931'].version}`, roots: ['test/Invoice-unit-UBL', 'test/CreditNote-unit-UBL', 'test/cii'].map((d) => path.join(artefactDir('cen-en16931'), d)), roundtrip: false },
];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.xml$/i.test(e.name) ? [p] : [];
  }).sort();
}

const explanations: Record<string, string> = existsSync(path.join(root, 'tools/conformance/explanations.json'))
  ? JSON.parse(readFileSync(path.join(root, 'tools/conformance/explanations.json'), 'utf-8')) : {};

// ---------------------------------------------------------------- per-file records
interface Rec {
  corpus: string; rel: string; file: string; xml: string;
  unsupported?: string;
  ours?: ValidationResult; oursError?: string;
  oracle?: { rulesets: Record<string, { fired: number; failed: string[]; advisory: string[] }>; xsd: { valid: boolean; errors: string[] } | null; error: string | null };
  oracleMismatch?: string[];
  kosit?: 'accept' | 'reject' | 'no-scenario';
  kositMismatch?: boolean;
  /** CEN unit tests: the rule that must (or must not) fire for this embedded snippet. */
  expect?: { kind: 'fire' | 'silent'; rule: string };
  expectFailed?: boolean;
  rt?: { skipped?: string; revalidated?: boolean; fixpoint?: boolean; fixpointDiff?: string[]; totals?: boolean; totalsDiff?: string[]; error?: string };
}

const records: Rec[] = [];
const unitDir = path.join(outDir, 'cen-unit');
rmSync(unitDir, { recursive: true, force: true });
mkdirSync(unitDir, { recursive: true });
for (const c of corpora) {
  let files = c.roots.flatMap(walk);
  if (quick) files = files.slice(0, 15);
  if (c.id === 'cen-unit-tests') {
    // Each <test> wraps one tiny invoice and says which rule must fire (<error>/<warning>) or stay silent (<success>).
    const base = artefactDir('cen-en16931');
    for (const f of files) {
      const set = readFileSync(f, 'utf-8');
      const tests = [...set.matchAll(/<test>([\s\S]*?)<\/test>/g)];
      tests.forEach((m, i) => {
        const body = m[1]!;
        const assertion = /<assert>([\s\S]*?)<\/assert>/.exec(body)!;
        const kind = /<success>\s*([^<\s]+)/.exec(assertion[1]!);
        const fire = /<(?:error|warning)>\s*([^<\s]+)/.exec(assertion[1]!);
        const doc = body.replace(assertion[0], '').trim();
        if (!doc.startsWith('<') || !(kind || fire)) return;
        const out = path.join(unitDir, `${path.basename(path.dirname(f))}__${path.basename(f, '.xml')}-${i + 1}.xml`);
        writeFileSync(out, `<?xml version="1.0" encoding="UTF-8"?>\n${doc}\n`);
        records.push({
          corpus: c.id, rel: `${path.relative(base, f).replaceAll('\\', '/')}#${i + 1}`, file: out, xml: readFileSync(out, 'utf-8'),
          expect: fire ? { kind: 'fire', rule: fire[1]! } : { kind: 'silent', rule: kind![1]! },
        });
      });
    }
    continue;
  }
  for (const f of files) {
    const r: Rec = { corpus: c.id, rel: path.relative(artefactDir(c.id === 'kosit-testsuite' ? 'xrechnung-testsuite' : c.id.startsWith('peppol') ? 'peppol-bis-3' : 'cen-en16931'), f).replaceAll('\\', '/'), file: f, xml: readFileSync(f, 'utf-8') };
    records.push(r);
  }
}
console.log(`${records.length} files in ${corpora.length} corpora`);

// ---------------------------------------------------------------- (a) ours
const started = Date.now();
for (const [i, r] of records.entries()) {
  try {
    r.ours = await validate(r.xml, r.expect ? { xsd: false } : {});
  } catch (e) {
    if (e instanceof ValidationInputError) r.unsupported = e.message;
    else r.oursError = String((e as Error).message ?? e).slice(0, 300);
  }
  if (i % 100 === 99) console.log(`  validated ${i + 1}/${records.length} (${Math.round((Date.now() - started) / 1000)}s)`);
}

// ---------------------------------------------------------------- reference (Saxon-HE + lxml)
const sources = rulesetSources() as Record<string, { xslt: string }>;
const xsdRoot = path.join(root, 'packages/validate/artefacts/xsd');
const xsdFor = (r: Rec): string | null => {
  const d = r.ours!.detected;
  if (d.syntax === 'ubl-invoice') return path.join(xsdRoot, 'ubl-2.1/maindoc/UBL-Invoice-2.1.xsd');
  if (d.syntax === 'ubl-creditnote') return path.join(xsdRoot, 'ubl-2.1/maindoc/UBL-CreditNote-2.1.xsd');
  const p = r.ours!.detected.profile;
  if (p === 'extended') return path.join(xsdRoot, 'facturx-extended/Factur-X_EXTENDED.xsd');
  if (p === 'minimum') return path.join(xsdRoot, 'facturx-minimum/Factur-X_MINIMUM.xsd');
  if (p === 'basicwl') return path.join(xsdRoot, 'facturx-basicwl/Factur-X_BASICWL.xsd');
  return path.join(xsdRoot, 'cii-d16b/CrossIndustryInvoice_100pD16B.xsd');
};
mkdirSync(outDir, { recursive: true });
const jobs = records.filter((r) => r.ours).map((r, i) => ({
  id: String(records.indexOf(r)), file: r.file,
  xslts: Object.fromEntries(r.ours!.ruleSets.map((rs) => [rs.id, sources[rs.id]!.xslt])), xsd: r.expect ? null : xsdFor(r),
}));
writeFileSync(path.join(outDir, 'oracle-in.json'), JSON.stringify(jobs));
const py = spawnSync('node', [path.join(root, 'tools/py.mjs'), '-I', path.join(root, 'tools/conformance/oracle.py'), path.join(outDir, 'oracle-in.json'), path.join(outDir, 'oracle-out.json')], { stdio: 'inherit' });
if (py.status !== 0) throw new Error('the Saxon-HE reference run failed (pip install -r tools/requirements.txt)');
const oracleOut = JSON.parse(readFileSync(path.join(outDir, 'oracle-out.json'), 'utf-8')) as Record<string, NonNullable<Rec['oracle']>>;
const setOf = (a: string[]) => a.join(',');
for (const j of jobs) {
  const r = records[Number(j.id)]!;
  r.oracle = oracleOut[j.id];
  const o = r.oracle!;
  const mism: string[] = [];
  if (o.error) mism.push(`reference could not process the file: ${o.error}`);
  else {
    for (const rs of r.ours!.ruleSets) {
      const ref = o.rulesets[rs.id];
      const mine = r.ours!.results.filter((x) => x.ruleSet === rs.id);
      // Compare effective-severity-independent: the reference knows only the stylesheet's own flags.
      const sev = (x: (typeof mine)[number]) => x.originalSeverity ?? x.severity;
      const mineFailed = mine.filter((x) => sev(x) === 'error' || sev(x) === 'fatal').map((x) => x.ruleId).sort();
      const mineAdv = mine.filter((x) => sev(x) === 'warning' || sev(x) === 'info').map((x) => x.ruleId).sort();
      if (!ref) { mism.push(`${rs.id}: not run by the reference`); continue; }
      if (setOf(mineFailed) !== setOf(ref.failed)) mism.push(`${rs.id}: failed rules ours [${[...new Set(mineFailed)]}] vs Saxon [${[...new Set(ref.failed)]}]`);
      if (setOf(mineAdv) !== setOf(ref.advisory)) mism.push(`${rs.id}: advisory rules ours [${[...new Set(mineAdv)]}] vs Saxon [${[...new Set(ref.advisory)]}]`);
      if (rs.fired !== ref.fired) mism.push(`${rs.id}: rules fired ${rs.fired} vs ${ref.fired}`);
    }
    const mx = r.ours!.xsd;
    if (o.xsd && mx.ran && mx.valid !== o.xsd.valid) mism.push(`XSD: ours ${mx.valid} vs lxml ${o.xsd.valid}`);
  }
  r.oracleMismatch = mism;
}

// ---------------------------------------------------------------- (b) official KoSIT validator
const java = spawnSync('java', ['-version'], { encoding: 'utf-8' });
const haveJava = java.status === 0;
if (haveJava) {
  const jar = path.join(artefactDir('kosit-validator'), 'validator-1.6.3-standalone.jar');
  const cfg = artefactDir('kosit-xrechnung-config');
  const byDir = new Map<string, Rec[]>();
  for (const r of records.filter((x) => x.ours && !x.expect)) {
    const d = path.dirname(r.file);
    (byDir.get(d) ?? byDir.set(d, []).get(d)!).push(r);
  }
  rmSync(path.join(outDir, 'kosit'), { recursive: true, force: true });
  let n = 0;
  for (const [dir, recs] of byDir) {
    const o = path.join(outDir, 'kosit', String(n++));
    spawnSync('java', ['-jar', jar, '-s', path.join(cfg, 'scenarios.xml'), '-r', cfg, '-o', o, ...recs.map((r) => r.file)], { encoding: 'utf-8', maxBuffer: 1 << 28 });
    for (const r of recs) {
      const rp = path.join(o, `${path.basename(r.file).replace(/\.xml$/i, '')}-report.xml`);
      if (!existsSync(rp)) { r.kosit = 'no-scenario'; continue; }
      const rep = readFileSync(rp, 'utf-8');
      r.kosit = /<rep:assessment>\s*<rep:accept/.test(rep) ? 'accept' : /<rep:assessment>\s*<rep:reject/.test(rep) ? 'reject' : 'no-scenario';
      if (/<rep:noScenarioMatched/.test(rep)) r.kosit = 'no-scenario';
      // The official verdict only applies where KoSIT has a scenario for the document's profile.
      if (r.kosit !== 'no-scenario' && ['xrechnung', 'en16931'].includes(r.ours!.detected.profile)) {
        r.kositMismatch = (r.kosit === 'accept') !== r.ours!.valid;
      }
    }
  }
}

// ---------------------------------------------------------------- (c) round trip
const statedTotals = (xml: string): Record<string, string | undefined> => {
  const rootEl = parseXml(xml);
  if (rootEl.name === 'CrossIndustryInvoice') {
    const ms = descend(child(rootEl, 'SupplyChainTradeTransaction'), 'ApplicableHeaderTradeSettlement', 'SpecifiedTradeSettlementHeaderMonetarySummation');
    const cur = text(descend(child(rootEl, 'SupplyChainTradeTransaction'), 'ApplicableHeaderTradeSettlement', 'InvoiceCurrencyCode'));
    const tax = children(ms, 'TaxTotalAmount').find((e) => e.attributes.find((a) => a.name === 'currencyID')?.value === cur) ?? child(ms, 'TaxTotalAmount');
    return { taxBasis: text(child(ms, 'TaxBasisTotalAmount')), taxTotal: text(tax), grand: text(child(ms, 'GrandTotalAmount')), due: text(child(ms, 'DuePayableAmount')) };
  }
  const lm = child(rootEl, 'LegalMonetaryTotal');
  return { taxBasis: text(child(lm, 'TaxExclusiveAmount')), taxTotal: text(descend(rootEl, 'TaxTotal', 'TaxAmount')), grand: text(child(lm, 'TaxInclusiveAmount')), due: text(child(lm, 'PayableAmount')) };
};
const minor = (s: string | undefined): number | undefined => (s === undefined ? undefined : Math.round(Number(s) * 100));
const flat = (v: unknown, p = '', out: Record<string, string> = {}): Record<string, string> => {
  if (v === undefined || v === null) return out;
  if (typeof v !== 'object') { out[p] = String(v); return out; }
  for (const [k, x] of Object.entries(v as object)) flat(x, Array.isArray(v) ? `${p}[${k}]` : p ? `${p}.${k}` : k, out);
  return out;
};

for (const r of records.filter((x) => x.ours)) {
  const corpus = corpora.find((c) => c.id === r.corpus)!;
  if (!corpus.roundtrip) { r.rt = { skipped: 'verdict-only corpus' }; continue; }
  if (!r.ours!.valid) { r.rt = { skipped: 'document is not valid, so there is nothing to reproduce' }; continue; }
  try {
    const first = detectXmlFormat(r.xml);
    const d = r.ours!.detected;
    const profile = d.profile === 'xrechnung' ? 'xrechnung' : d.profile === 'peppol' ? 'peppol' : 'en16931';
    const rebuilt = d.syntax === 'cii'
      ? buildCII(first.invoice, { profile: profile === 'peppol' ? 'en16931' : profile, customizationId: d.customizationId })
      : buildUBL(first.invoice, { profile, customizationId: d.customizationId });
    const again = await validate(rebuilt);
    const second = detectXmlFormat(rebuilt);
    const a = flat(first.invoice), b = flat(second.invoice);
    const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).slice(0, 8).map((k) => `${k}: ${a[k] ?? '(absent)'} -> ${b[k] ?? '(absent)'}`);
    const st = statedTotals(r.xml);
    const t = totals(first.invoice);
    const td: string[] = [];
    for (const [k, want] of [['taxBasis', t.taxBasis], ['taxTotal', t.taxTotal], ['grand', t.grand], ['due', t.due]] as const) {
      const got = minor(st[k]);
      if (got !== undefined && got !== want) td.push(`${k}: document ${got} vs computed ${want}`);
    }
    r.rt = { revalidated: again.valid, fixpoint: diff.length === 0, fixpointDiff: diff, totals: td.length === 0, totalsDiff: td };
  } catch (e) {
    r.rt = { error: String((e as Error).message ?? e).slice(0, 200) };
  }
}

for (const r of records) {
  if (!r.expect || !r.ours) continue;
  const fired = r.ours.results.some((x) => (x.originalSeverity ?? x.severity) !== 'info' && x.ruleId === r.expect!.rule);
  r.expectFailed = r.expect.kind === 'fire' ? !fired : fired;
}

// ---------------------------------------------------------------- report
const lines: string[] = [];
const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
const expl = (r: Rec, kind: string) => explanations[`${r.corpus}/${r.rel}#${kind}`];
let unexplained = 0;
const failures: string[] = [];
const noteFailure = (r: Rec, kind: string, what: string) => {
  const e = expl(r, kind);
  if (!e) unexplained++;
  failures.push(`- \`${r.corpus}/${r.rel}\` — **${kind}**: ${what}${e ? `\n  - Explanation: ${e}` : '\n  - **UNEXPLAINED**'}`);
};

lines.push('# Conformance report', '', '<!-- Generated by tools/conformance/run.ts (npm run conformance). Do not hand-edit. -->', '');
lines.push('Our runtime validator (the code `validate()` runs in Node and, minus XSD, in a browser) compared with the official validators on the official sample files.', '');
lines.push('## Pinned inputs', '', '| Artefact | Version | Pin |', '|---|---|---|');
for (const [id, a] of Object.entries(manifest.artefacts) as [string, { version: string; sha256?: string; commit?: string }][]) {
  lines.push(`| ${id} | ${a.version} | \`${(a.sha256 ?? a.commit ?? '').slice(0, 12)}\` |`);
}
lines.push('', '## How to read this', '',
  '- **Reference agreement**: for every file, the rule sets our engine chose (from the root element and BT-24) are run by Saxon-HE on the *same publisher XSLT*; XSD by lxml. We require the same failed rule ids, the same advisory rule ids and the same number of fired rules per rule set, and the same XSD verdict.',
  '- **KoSIT agreement**: the official KoSIT validator (java, validator-configuration-xrechnung) says ACCEPTABLE or not; compared where KoSIT has a scenario for the document (XRechnung and plain EN 16931). Our `valid` must equal KoSIT\'s acceptance.',
  '- **Round trip** (valid documents only): parse to our model, write it back in the same syntax and profile, validate again, read it again (must be identical to the first read), and compare the document\'s stated totals with the totals computed from the model.', '');
lines.push(haveJava ? '' : '> Java was not available in this run, so the KoSIT columns are empty.', '');

lines.push('## Summary', '', '| Corpus | Files | Not CII/UBL | Reference agreement | Rule expectation | KoSIT agreement | Round trip: revalidates | fixed point | totals |', '|---|---|---|---|---|---|---|---|---|');
let totAgree = 0, totProc = 0;
for (const c of corpora) {
  const rs = records.filter((r) => r.corpus === c.id);
  const proc = rs.filter((r) => r.ours);
  const agree = proc.filter((r) => r.oracleMismatch!.length === 0).length;
  const kos = proc.filter((r) => r.kositMismatch !== undefined);
  const kosOk = kos.filter((r) => !r.kositMismatch).length;
  const rt = proc.filter((r) => r.rt && !r.rt.skipped && !r.rt.error);
  const cell = (f: (r: Rec) => boolean | undefined) => `${rt.filter(f).length}/${rt.length}`;
  const exp = proc.filter((r) => r.expect);
  const expCell = exp.length ? `${exp.filter((r) => !r.expectFailed).length}/${exp.length}` : 'n/a';
  totAgree += agree; totProc += proc.length;
  lines.push(`| ${c.title} | ${rs.length} | ${rs.length - proc.length} | ${agree}/${proc.length} (${pct(agree, proc.length)}) | ${expCell} | ${haveJava ? `${kosOk}/${kos.length} (${pct(kosOk, kos.length)})` : 'n/a'} | ${cell((r) => r.rt!.revalidated)} | ${cell((r) => r.rt!.fixpoint)} | ${cell((r) => r.rt!.totals)} |`);
}
lines.push('', `Overall reference agreement: **${totAgree}/${totProc} (${pct(totAgree, totProc)})**.`, '');
lines.push('Sources:', ...corpora.map((c) => `- ${c.title}: ${c.source}`), '');
lines.push('Not covered, and why: the official FeRD/ZUGFeRD sample set and the Factur-X samples are published on sites this build environment could not reach (see KNOWN-GAPS.md), so PDF samples are not part of this report.', '');

for (const r of records) {
  if (r.oursError) noteFailure(r, 'crash', `our validator threw: ${r.oursError}`);
  if (r.unsupported && corpora.find((c) => c.id === r.corpus)) { /* reported in counts only */ }
  if (r.oracleMismatch?.length) noteFailure(r, 'reference', r.oracleMismatch.join('; '));
  if (r.expectFailed) noteFailure(r, 'expectation', `CEN says rule ${r.expect!.rule} must ${r.expect!.kind === 'fire' ? 'fire' : 'stay silent'}; it ${r.expect!.kind === 'fire' ? 'did not' : 'did'}`);
  if (r.kositMismatch) noteFailure(r, 'kosit', `KoSIT says ${r.kosit}, we say ${r.ours!.valid ? 'valid' : 'invalid'}`);
  if (r.rt && !r.rt.skipped) {
    if (r.rt.error) noteFailure(r, 'roundtrip-error', r.rt.error);
    else {
      if (!r.rt.revalidated) noteFailure(r, 'roundtrip-revalidate', 're-serialized document is no longer valid');
      if (!r.rt.fixpoint) noteFailure(r, 'roundtrip-fixpoint', r.rt.fixpointDiff!.join('; '));
      if (!r.rt.totals) noteFailure(r, 'roundtrip-totals', r.rt.totalsDiff!.join('; '));
    }
  }
}

// Informative, recorded by `npm run compare:mustang -- --corpora --record` (needs Java and a long run, so it is not part
// of this run or of CI). Rendered from the committed summary so that this file stays fully generated.
const mustangFile = path.join(root, 'tools/conformance/mustang-comparison.json');
if (existsSync(mustangFile)) {
  type Disagreement = { file: string; reason: string; conformo: string; mustang: string; kosit: string; kositSidesWith: string; onlyConformo: string[]; onlyMustang: string[] };
  type MC = { mustangVersion: string; disagreements: Disagreement[];
    corpora: { title: string; files: number; sameVerdict: number; bothValid: number; bothInvalid: number; sameFailedRules: number }[] };
  const mc = JSON.parse(readFileSync(mustangFile, 'utf-8')) as MC;
  lines.push('## Comparison with Mustangproject (informative)', '',
    `Mustangproject is a widely used Java library for ZUGFeRD/Factur-X and XRechnung. Mustang-CLI ${mc.mustangVersion} (\`--action validate\`) was run on the same official files as Conformo's \`validate()\` with full rule sets including XSD. Mustang ships its own copies of the rules, which can be older or newer than the pins above, and adds checks of its own (for example a recalculation of totals). Where the two verdicts differ, the official KoSIT validator decides. This is informative, not a CI gate: it is recorded with \`npm run compare:mustang -- --corpora --record\` and rendered here by the conformance run.`, '',
    '| Corpus | Files | Same verdict | Both valid | Both invalid | Same failed rule ids |', '|---|---|---|---|---|---|',
    ...mc.corpora.map((c) => `| ${c.title} | ${c.files} | ${c.sameVerdict}/${c.files} | ${c.bothValid} | ${c.bothInvalid} | ${c.sameFailedRules}/${c.files} |`), '');
  // Who is right: the KoSIT validator where it has a scenario; otherwise the publisher's own rule files, which this
  // run executed on the same file above (reference agreement), if they gave Conformo's result.
  const byFile = new Map(records.map((r) => [`${r.corpus}/${r.rel}`, r]));
  const referee = (d: Disagreement) => {
    if (d.kositSidesWith === 'conformo') return 'KoSIT: agrees with Conformo';
    if (d.kositSidesWith === 'mustang') return 'KoSIT: agrees with Mustang';
    const rec = byFile.get(d.file);
    return rec?.ours && !rec.oracleMismatch?.length ? 'no KoSIT scenario; the publisher\'s own rule files agree with Conformo' : 'no KoSIT scenario; not decided';
  };
  const only = (who: string, ids: string[]) => (ids.length ? `, ${who} only: ${ids.join(', ')}` : '');
  const groups = new Map<string, Disagreement[]>();
  for (const d of mc.disagreements) groups.set(d.reason, [...(groups.get(d.reason) ?? []), d]);
  const kositFor = mc.disagreements.filter((d) => d.kositSidesWith !== 'unknown');
  lines.push(...(mc.disagreements.length
    ? [`Different verdicts on ${mc.disagreements.length} file(s). The official KoSIT validator had a scenario for ${kositFor.length} of them and agreed with Conformo on ${kositFor.filter((d) => d.kositSidesWith === 'conformo').length}, with Mustang on ${kositFor.filter((d) => d.kositSidesWith === 'mustang').length}.`, '',
      ...[...groups].flatMap(([reason, ds]) => [`**${reason}** (${ds.length} file${ds.length === 1 ? '' : 's'})`, '',
        ...ds.map((d) => `- \`${d.file}\`: Conformo ${d.conformo}, Mustang ${d.mustang}${only('Mustang', d.onlyMustang)}${only('Conformo', d.onlyConformo)} (${referee(d)})`), ''])]
    : ['Conformo and Mustang reach the same verdict on every file.', '']));
}

lines.push('## Mismatches and failures', '', failures.length ? `${failures.length} finding(s); ${unexplained} unexplained.` : 'None.', '', ...failures, '');
lines.push('## Files not processed', '');
const unsup = records.filter((r) => r.unsupported);
lines.push(unsup.length ? unsup.map((r) => `- \`${r.corpus}/${r.rel}\`: ${r.unsupported}`).join('\n') : 'None.', '');

writeFileSync(path.join(root, 'docs/CONFORMANCE.md'), lines.join('\n'));
writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(records.map(({ xml: _x, ...r }) => ({ ...r, ours: r.ours && { valid: r.ours.valid, detected: r.ours.detected, ruleSets: r.ours.ruleSets, xsd: r.ours.xsd } })), null, 1));
console.log(`reference agreement ${totAgree}/${totProc}; ${failures.length} findings, ${unexplained} unexplained`);
if (strict && unexplained > 0) process.exit(1);
