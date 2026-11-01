/**
 * Used by the e2e flows (e2e/flows.spec.ts): takes a PDF the app downloaded, extracts the embedded XML exactly as a
 * receiver would, and runs the official rule sets on it in Node; with --kosit also the official KoSIT validator (Java),
 * the reference implementation German authorities use for XRechnung. Prints one JSON object.
 *
 *   tsx tools/verify-invoice-pdf.ts <file.pdf> [--country DE|FR] [--kosit]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractEmbeddedXml } from '@conformo/parse';
import { validate } from '@conformo/validate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) throw new Error('usage: verify-invoice-pdf.ts <file.pdf> [--country DE|FR] [--kosit]');
const country = args.includes('--country') ? (args[args.indexOf('--country') + 1] as 'DE' | 'FR') : undefined;

const pdf = new Uint8Array(readFileSync(file));
const { xml, filename } = await extractEmbeddedXml(pdf);
const r = await validate(xml, country ? { country } : {});
const pdfText = Buffer.from(pdf).toString('latin1');
const conformance = /<fx:ConformanceLevel>([^<]+)<\/fx:ConformanceLevel>/.exec(pdfText)?.[1];

let kosit: { ran: boolean; accepted?: boolean; report?: string } = { ran: false };
if (args.includes('--kosit')) {
  const jar = path.join(root, 'tools/artefacts/kosit-validator/validator-1.6.3-standalone.jar');
  const cfg = path.join(root, 'tools/artefacts/kosit-xrechnung-config');
  if (!existsSync(jar) || !existsSync(cfg)) throw new Error('KoSIT validator missing: run `npm run artefacts:fetch -- --group java` (needs Java 11+)');
  const dir = mkdtempSync(path.join(tmpdir(), 'kosit-'));
  try {
    const x = path.join(dir, 'invoice.xml');
    writeFileSync(x, xml);
    const run = spawnSync('java', ['-jar', jar, '-s', path.join(cfg, 'scenarios.xml'), '-r', cfg, '-o', dir, x], { encoding: 'utf-8' });
    if (run.error) throw new Error(`java could not start (${run.error.message}): install Java 11+ (e.g. winget install EclipseAdoptium.Temurin.17.JDK)`);
    const rp = path.join(dir, 'invoice-report.xml');
    if (!existsSync(rp)) throw new Error(`KoSIT wrote no report:\n${run.stdout}\n${run.stderr}`);
    const report = readFileSync(rp, 'utf-8');
    kosit = { ran: true, accepted: /<rep:assessment>\s*<rep:accept/.test(report), report: report.length > 4000 ? undefined : report };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  filename,
  conformance,
  profile: r.detected.profile,
  valid: r.valid,
  ruleSets: r.ruleSets.map((x) => x.id),
  failures: r.results.filter((x) => x.severity === 'error' || x.severity === 'fatal').map((x) => `${x.ruleId}: ${x.message}`),
  kosit,
}));
