#!/usr/bin/env node
// Builds the runtime validation artefacts into packages/validate/artefacts/ from the pinned
// sources in tools/artefacts.manifest.json (fetched by tools/fetch-artefacts.mjs):
//
//   <id>.sef.json.gz  SaxonJS "stylesheet export" of each Schematron ruleset (runs in Node and in a browser)
//   xsd/...         the official XSDs (UBL 2.1, UN/CEFACT CII D16B)
//   rulesets.json   what each ruleset is, its source version, sizes and SHA-256
//
// Pure Node (+ the `xslt3` compiler from npm): no bash, no Python, no Java, so it behaves the same on
// Windows and Linux. Peppol is published as Schematron source; SchXslt2 (itself compiled to SEF here)
// turns it into XSLT first. The other rulesets are the publishers' own prebuilt XSLT.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artefactDir, ensureGroups, manifest } from "./fetch-artefacts.mjs";
import { PEPPOL_XSL, patchedSource, rulesetSources, TMP_DIR } from "./rulesets-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "packages/validate/artefacts");
const tmp = TMP_DIR;
const xslt3 = path.join(root, "node_modules/.bin", process.platform === "win32" ? "xslt3.cmd" : "xslt3");

function run(args) {
  const r = spawnSync(xslt3, args, { encoding: "utf-8", shell: process.platform === "win32", maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`xslt3 ${args.join(" ")} failed:\n${r.stderr || r.stdout}`);
}

await ensureGroups(["build"]);
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

const kosit = artefactDir("kosit-xrechnung-config") + "/resources";
const cen = artefactDir("cen-en16931");
// Peppol: Schematron source -> XSLT via SchXslt2 (compiled to SEF once, then run by SaxonJS).
const transpileXsl = path.join(artefactDir("schxslt2"), "schxslt2-1.11.2/transpile.xsl");
const transpileSef = path.join(tmp, "schxslt2-transpile.sef.json");
const peppolXsl = PEPPOL_XSL;
if (!existsSync(transpileSef)) run([`-xsl:${transpileXsl}`, `-export:${transpileSef}`, "-nogo"]);
run([`-s:${artefactDir("peppol-bis-3")}/rules/sch/PEPPOL-EN16931-UBL.sch`, `-xsl:${transpileSef}`, `-o:${peppolXsl}`]);

const RULESETS = rulesetSources();

const sha = (b) => createHash("sha256").update(b).digest("hex");
const report = {};
for (const [id, r] of Object.entries(RULESETS)) {
  const sef = path.join(tmp, `${id}.sef.json`);
  console.log(`compiling ${id}`);
  // Compile a patched copy with a fixed public base URI (see runtimePatches): no absolute local path in the output.
  const { text, applied } = patchedSource(id, readFileSync(r.xslt, "utf-8"));
  const src = path.join(tmp, `${id}.patched.xsl`);
  writeFileSync(src, text);
  if (applied.length) console.log(`  runtime patches: ${applied.join(", ")}`);
  run([`-xsl:${src}`, `-export:${sef}`, "-nogo"]);
  const buf = readFileSync(sef);
  // Ship gzip only (about 7x smaller unpacked). Node gunzips on load; pages are served compressed by their host anyway.
  writeFileSync(path.join(out, `${id}.sef.json.gz`), gzipSync(buf, { level: 9 }));
  rmSync(path.join(out, `${id}.sef.json`), { force: true });
  report[id] = { label: r.label, source: r.source, patches: applied, bytes: buf.length, gzipBytes: gzipSync(buf, { level: 9 }).length, sha256: sha(buf) };
}

// Official XSDs, copied verbatim. UBL 2.1 and CII D16B come from the KoSIT bundle (the same files the KoSIT
// validator uses); the Factur-X MINIMUM / BASIC WL / EXTENDED schemas come from the pinned factur-x release.
const xsdOut = path.join(out, "xsd");
rmSync(xsdOut, { recursive: true, force: true });
const ublSrc = `${kosit}/ubl/2.1/xsd`;
cpSync(`${ublSrc}/common`, path.join(xsdOut, "ubl-2.1/common"), { recursive: true });
for (const f of ["UBL-Invoice-2.1.xsd", "UBL-CreditNote-2.1.xsd"]) cpSync(`${ublSrc}/maindoc/${f}`, path.join(xsdOut, "ubl-2.1/maindoc", f));
cpSync(`${kosit}/cii/16b/xsd`, path.join(xsdOut, "cii-d16b"), { recursive: true });
// KSeF FA(3): the Ministry of Finance's schema (github.com/CIRFMF/ksef-docs). The only change is that the main schema's
// import of the base types points at the local copy instead of http://crd.gov.pl/...; the schema content is untouched.
const ksefSrc = path.join(artefactDir("ksef-docs"), "faktury/schemy/FA");
const ksefOut = path.join(xsdOut, "ksef-fa3");
cpSync(path.join(ksefSrc, "bazowe"), ksefOut, { recursive: true });
writeFileSync(path.join(ksefOut, "schemat_FA3.xsd"), readFileSync(path.join(ksefSrc, "schemat_FA(3)_v1-0E.xsd"), "utf-8")
  .replace(/schemaLocation="http:\/\/crd\.gov\.pl\/[^"]*\/([^\/"]+\.xsd)"/g, 'schemaLocation="$1"'));
const fx = path.join(artefactDir("factur-x-wheel"), "facturx/xsd_and_schematron");
for (const p of ["extended", "minimum", "basicwl"]) cpSync(`${fx}/facturx-${p}`, path.join(xsdOut, `facturx-${p}`), { recursive: true, filter: (f) => !f.endsWith(".xsl") && !f.endsWith(".xml") });

// KoSIT's acceptance criteria are not just "which rules ran": its scenarios.xml re-levels some rules per
// scenario (e.g. BR-CL-21 becomes advisory). Mirror them, keyed "<syntax>:<variant>", so "valid" here means
// what the KoSIT validator calls ACCEPTABLE. The engine reports every re-levelled finding as such.
const levelOverrides = {};
const scenariosXml = readFileSync(path.join(artefactDir("kosit-xrechnung-config"), "scenarios.xml"), "utf-8");
for (const block of scenariosXml.split("<scenario>").slice(1)) {
  const name = /<name>(EN16931 (?:XRechnung[^<]*|\((?:UBL|CII)[^<]*))<\/name>/.exec(block)?.[1];
  if (!name) continue;
  const syntax = /CII/.test(name) ? "cii" : /CreditNote/.test(name) ? "ubl-creditnote" : "ubl-invoice";
  const variant = !/XRechnung/.test(name) ? "en16931" : /Extension/.test(name) ? "extension" : /CVD/.test(name) ? "cvd" : "standard";
  const levels = {};
  for (const m of block.matchAll(/<customLevel level="([a-z]+)">([^<]+)<\/customLevel>/g)) levels[m[2].trim()] = m[1];
  levelOverrides[`${syntax}:${variant}`] = levels;
}
writeFileSync(path.join(out, "rulesets.json"), JSON.stringify({ generatedFrom: "tools/artefacts.manifest.json", rulesets: report, levelOverrides }, null, 2) + "\n");
console.log("compiled. gzipped sizes:");
for (const [id, r] of Object.entries(report)) console.log(`  ${id.padEnd(16)} ${(r.gzipBytes / 1024).toFixed(0)} KB gz  (${(r.bytes / 1048576).toFixed(1)} MB raw)`);
