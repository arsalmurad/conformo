#!/usr/bin/env node
// Informative comparison of Conformo with Mustangproject (Java), file by file. Not a CI gate.
//
// Usage: node tools/compare-mustang.mjs <file-or-dir...> [--corpora] [--jobs N] [--record]
//   <file-or-dir>  XML or PDF files, or directories searched recursively for *.xml and *.pdf
//   --corpora      add the KoSIT XRechnung test suite and the CEN EN 16931 examples (tools/artefacts, pinned)
//   --record       also write tools/conformance/mustang-comparison.json, which the conformance report renders
//                  under "Comparison with Mustangproject (informative)" (so the docs are generated, never hand-edited)
//
// For each file: Conformo's validate() in Node (full rule sets including XSD, through @conformo/toolkit) and
// `java -jar Mustang-CLI.jar --action validate --source <file>` (flags from Mustang-CLI's own Main.java; exit code 0
// only when Mustang finds the file completely valid). Where the two verdicts disagree, the official KoSIT validator is
// asked too (XML only), so the report can say which side the reference agrees with.
// Writes out/compare-mustang.md and out/compare-mustang.json.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { artefactDir, ensure, manifest } from './fetch-artefacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out');

// ---------------------------------------------------------------------------------------------------------------
// Parsing Mustang's report (pure; unit-tested on a recorded report).

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Rule id of one Mustang message: "[ID BR-DE-15]" (Schematron), else the leading "[BR-..]", else "mustang-type-<n>". */
export function mustangRuleId(type, text) {
  const t = decode(text);
  return t.match(/\[ID ([^\]\s]+)\]/)?.[1] ?? t.match(/^\s*\[([A-Z][\w.-]*-[\w.-]+)\]/)?.[1] ?? `mustang-type-${type}`;
}

/** Mustang's XML report: overall status and the failed (error/fatal) and advisory (warning/notice) rule ids. */
export function parseMustangReport(stdout) {
  const xml = stdout.slice(stdout.indexOf('<validation'));
  const statuses = [...xml.matchAll(/<summary status="(\w+)"\s*\/>/g)].map((m) => m[1]);
  // <exception> is Mustang stopping on an internal error (e.g. a Java NullPointerException); it then reports invalid.
  const msgs = [...xml.matchAll(/<(error|fatal|exception|warning|notice)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map((m) => {
    const type = m[2].match(/type="(\d+)"/)?.[1] ?? '?';
    return { level: m[1], id: m[1] === 'exception' ? `mustang-exception-${type}` : mustangRuleId(type, m[3]) };
  });
  const uniq = (a) => [...new Set(a)].sort();
  return {
    status: statuses.at(-1) ?? 'unknown',
    failed: uniq(msgs.filter((m) => ['error', 'fatal', 'exception'].includes(m.level)).map((m) => m.id)),
    advisory: uniq(msgs.filter((m) => m.level === 'warning' || m.level === 'notice').map((m) => m.id)),
  };
}

/** Conformo's failed rule ids, with an XSD failure as "XSD". */
export function conformoFailed(result) {
  const ids = result.results.filter((r) => r.severity === 'error' || r.severity === 'fatal').map((r) => r.ruleId);
  if (result.xsd?.ran && result.xsd.valid === false) ids.push('XSD');
  return [...new Set(ids)].sort();
}

/** One comparison row. Rule-id differences are only a "difference" when the verdicts already differ or both fail. */
export function compareRow(file, conformo, mustang) {
  const onlyC = conformo.failed.filter((x) => !mustang.failed.includes(x));
  const onlyM = mustang.failed.filter((x) => !conformo.failed.includes(x));
  const verdictsAgree = conformo.valid === mustang.valid;
  return { file, conformo, mustang, verdictsAgree, onlyConformo: onlyC, onlyMustang: onlyM };
}

// ---------------------------------------------------------------------------------------------------------------

const MUSTANG_ID = 'mustang-cli';
const mustangJar = () => path.join(artefactDir(MUSTANG_ID), path.basename(new URL(manifest.artefacts[MUSTANG_ID].url).pathname));

function runMustang(file) {
  return new Promise((resolve) => {
    // --disable-file-logging: Mustang otherwise writes a log file into the working directory.
    const p = spawn('java', ['-jar', mustangJar(), '--action', 'validate', '--source', file, '--disable-file-logging'], { cwd: os.tmpdir() });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', () => {});
    p.on('close', (code) => {
      const r = parseMustangReport(out);
      // The exit code is Mustang's own verdict (performValidate exits -1 unless wasCompletelyValid()).
      resolve({ valid: code === 0, status: r.status, exit: code, failed: r.failed, advisory: r.advisory });
    });
  });
}

async function pool(items, n, fn) {
  const res = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      res[i] = await fn(items[i]);
      if (++done % 10 === 0 || done === items.length) console.error(`  mustang ${done}/${items.length}`);
    }
  }));
  return res;
}

/** The official KoSIT validator on a batch of XML files: 'accept' | 'reject' | 'no-scenario' per file. */
function kositVerdicts(files) {
  const verdicts = new Map();
  if (!files.length) return verdicts;
  const jar = path.join(artefactDir('kosit-validator'), path.basename(new URL(manifest.artefacts['kosit-validator'].url).pathname));
  const cfg = artefactDir('kosit-xrechnung-config');
  const base = path.join(outDir, 'compare-mustang-kosit');
  rmSync(base, { recursive: true, force: true });
  // One run per file: KoSIT names reports after the file's basename, and the corpora repeat basenames across folders.
  for (const [i, f] of files.entries()) {
    const o = path.join(base, String(i));
    mkdirSync(o, { recursive: true });
    spawnSync('java', ['-jar', jar, '-s', path.join(cfg, 'scenarios.xml'), '-r', cfg, '-o', o, f], { encoding: 'utf-8', maxBuffer: 1 << 28 });
    const rp = path.join(o, `${path.basename(f, path.extname(f))}-report.xml`);
    if (!existsSync(rp)) { verdicts.set(f, 'no-scenario'); continue; }
    const rep = readFileSync(rp, 'utf-8');
    verdicts.set(f, /<rep:noScenarioMatched/.test(rep) ? 'no-scenario' : /<rep:assessment>\s*<rep:accept/.test(rep) ? 'accept' : /<rep:assessment>\s*<rep:reject/.test(rep) ? 'reject' : 'no-scenario');
  }
  return verdicts;
}

const walk = (p) => statSync(p).isDirectory()
  ? readdirSync(p).sort().flatMap((n) => walk(path.join(p, n)))
  : /\.(xml|pdf)$/i.test(p) ? [p] : [];

export const CORPORA = () => [
  // `base`: file ids are <corpus>/<path under the artefact>, exactly as in the conformance run, so its records match.
  { id: 'kosit-testsuite', base: artefactDir('xrechnung-testsuite'), title: `KoSIT XRechnung test suite (${manifest.artefacts['xrechnung-testsuite'].version})`, roots: [path.join(artefactDir('xrechnung-testsuite'), 'src/test')] },
  { id: 'cen-examples', base: artefactDir('cen-en16931'), title: `CEN EN 16931 example files (${manifest.artefacts['cen-en16931'].version})`, roots: ['ubl/examples', 'cii/examples', 'test/testfiles'].map((d) => path.join(artefactDir('cen-en16931'), d)) },
];

const cell = (a) => (a.length ? a.join(', ') : '-');
const verdict = (v) => (v ? 'valid' : 'invalid');

export function renderMarkdown(rows, meta) {
  const L = [`# Conformo vs Mustangproject`, '', `Mustang-CLI ${meta.mustangVersion}; Conformo rule sets as pinned in tools/artefacts.manifest.json. Informative, not a CI gate.`, ''];
  L.push(`Files: ${rows.length}. Same verdict: ${rows.filter((r) => r.verdictsAgree).length}. Different verdict: ${rows.filter((r) => !r.verdictsAgree).length}.`, '');
  L.push('| File | Conformo | Mustang | Failed rules (Conformo) | Failed rules (Mustang) | Differences | KoSIT |', '|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const diff = [!r.verdictsAgree ? '**verdict**' : '', r.onlyConformo.length ? `only Conformo: ${r.onlyConformo.join(', ')}` : '', r.onlyMustang.length ? `only Mustang: ${r.onlyMustang.join(', ')}` : ''].filter(Boolean).join('; ') || '-';
    L.push(`| ${r.rel} | ${verdict(r.conformo.valid)} | ${verdict(r.mustang.valid)} | ${cell(r.conformo.failed)} | ${cell(r.mustang.failed)} | ${diff} | ${r.kosit ?? ''} |`);
  }
  return L.join('\n') + '\n';
}

/** Why two verdicts differ, in words, derived only from what each side reported. */
export function classify(r) {
  if (r.mustang.failed.some((x) => x.startsWith('mustang-exception-'))) return 'Mustang stopped with an internal Java exception while checking the file, and reports it invalid.';
  if (r.mustang.failed.includes('mustang-type-25')) return 'Mustang does not support the profile the document declares (ZUGFeRD 1.0), and reports it invalid.';
  if (!r.conformo.valid && r.mustang.valid && r.onlyConformo.length && r.onlyConformo.every((x) => /^(PEPPOL-|[A-Z]{2}-R-)/.test(x))) {
    return 'The document declares Peppol BIS Billing 3.0 in BT-24, so Conformo also applies the OpenPeppol rules, which the document fails; Mustang does not apply the Peppol BIS rules.';
  }
  if (r.conformo.valid && !r.mustang.valid && r.onlyMustang.some((x) => x.startsWith('FX-SCH-'))) return 'Mustang also applies its own Factur-X Schematron (FX-SCH-*) to a plain CII document.';
  if (r.conformo.valid && !r.mustang.valid) return 'Mustang reports rule failures that the rules Conformo runs for this document (CEN\'s release and the KoSIT configuration) do not raise as errors.';
  return 'Other.';
}

/** Summary per corpus, for tools/conformance/mustang-comparison.json and docs/CONFORMANCE.md. */
export function summarize(rows, corpora, meta) {
  const sides = (r) => (r.kosit === 'accept' || r.kosit === 'reject'
    ? ((r.kosit === 'accept') === r.conformo.valid ? 'conformo' : 'mustang') : 'unknown');
  return {
    mustangVersion: meta.mustangVersion,
    corpora: corpora.map((c) => {
      const rs = rows.filter((r) => r.corpus === c.id);
      return { id: c.id, title: c.title, files: rs.length, sameVerdict: rs.filter((r) => r.verdictsAgree).length,
        bothValid: rs.filter((r) => r.verdictsAgree && r.conformo.valid).length, bothInvalid: rs.filter((r) => r.verdictsAgree && !r.conformo.valid).length,
        sameFailedRules: rs.filter((r) => r.verdictsAgree && !r.onlyConformo.length && !r.onlyMustang.length).length };
    }),
    disagreements: rows.filter((r) => !r.verdictsAgree).map((r) => ({
      file: r.rel, reason: classify(r), conformo: verdict(r.conformo.valid), mustang: verdict(r.mustang.valid), kosit: r.kosit ?? 'not run', kositSidesWith: sides(r),
      onlyConformo: r.onlyConformo, onlyMustang: r.onlyMustang,
    })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const jobsAt = args.indexOf('--jobs');
  const jobs = jobsAt >= 0 ? Number(args[jobsAt + 1]) : Math.max(1, Math.min(4, os.cpus().length - 1));
  const paths = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--jobs');
  if (spawnSync('java', ['-version']).status !== 0) { console.error('Java 11+ is needed for Mustang and the KoSIT validator.'); process.exit(2); }
  await ensure(MUSTANG_ID);
  await ensure('kosit-validator');
  await ensure('kosit-xrechnung-config');

  const corpora = args.includes('--corpora') ? CORPORA() : [];
  const items = [
    ...paths.flatMap((p) => walk(path.resolve(p)).map((f) => ({ corpus: 'files', file: f, rel: path.relative(root, f).replaceAll('\\', '/') }))),
    ...corpora.flatMap((c) => c.roots.filter(existsSync).flatMap(walk).map((f) => ({ corpus: c.id, file: f, rel: `${c.id}/${path.relative(c.base, f).replaceAll('\\', '/')}` }))),
  ];
  if (!items.length) { console.error('usage: compare-mustang.mjs <file-or-dir...> [--corpora] [--jobs N] [--record]'); process.exit(2); }

  const { validate } = await tsImport(pathToFileURL(path.join(root, 'packages/toolkit/src/index.ts')).href, import.meta.url);
  console.error(`${items.length} files; Conformo first, then Mustang (${jobs} in parallel)`);
  for (const it of items) {
    try {
      const r = await validate(new Uint8Array(readFileSync(it.file)));
      it.conformo = { valid: r.valid, failed: conformoFailed(r) };
    } catch (e) {
      it.conformo = { valid: false, failed: [`not processed: ${String(e.message ?? e).split('\n')[0]}`] };
    }
  }
  const mustang = await pool(items, jobs, (it) => runMustang(it.file));
  const rows = items.map((it, i) => ({ ...compareRow(it.rel, it.conformo, mustang[i]), corpus: it.corpus, rel: it.rel, abs: it.file }));
  const disputed = rows.filter((r) => !r.verdictsAgree && /\.xml$/i.test(r.abs));
  const kv = kositVerdicts(disputed.map((r) => r.abs));
  for (const r of disputed) r.kosit = kv.get(r.abs);

  const meta = { mustangVersion: manifest.artefacts[MUSTANG_ID].version };
  mkdirSync(outDir, { recursive: true });
  const md = renderMarkdown(rows, meta);
  writeFileSync(path.join(outDir, 'compare-mustang.md'), md);
  writeFileSync(path.join(outDir, 'compare-mustang.json'), JSON.stringify(rows.map(({ abs: _a, ...r }) => r), null, 1));
  process.stdout.write(md);
  if (args.includes('--record')) {
    if (!corpora.length) { console.error('--record needs --corpora (the committed summary covers the official corpora only)'); process.exit(2); }
    const s = summarize(rows.filter((r) => r.corpus !== 'files'), corpora, meta);
    writeFileSync(path.join(root, 'tools/conformance/mustang-comparison.json'), JSON.stringify(s, null, 2) + '\n');
    console.error('recorded tools/conformance/mustang-comparison.json; run npm run conformance to regenerate docs/CONFORMANCE.md');
  }
}
