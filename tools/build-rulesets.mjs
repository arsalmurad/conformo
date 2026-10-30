#!/usr/bin/env node
// Builds the runtime validation artefacts into packages/validate/artefacts/ from the pinned
// sources in tools/artefacts.manifest.json (fetched by tools/fetch-artefacts.mjs):
//
//   <id>.sef.json   SaxonJS "stylesheet export" of each Schematron ruleset (runs in Node and in a browser)
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "packages/validate/artefacts");
const tmp = path.join(root, "tools/artefacts/.tmp");
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
const ver = (id) => manifest.artefacts[id].version;

// Peppol: Schematron source -> XSLT via SchXslt2 (compiled to SEF once, then run by SaxonJS).
const transpileXsl = path.join(artefactDir("schxslt2"), "schxslt2-1.11.2/transpile.xsl");
const transpileSef = path.join(tmp, "schxslt2-transpile.sef.json");
const peppolXsl = path.join(tmp, "peppol-ubl.xsl");
if (!existsSync(transpileSef)) run([`-xsl:${transpileXsl}`, `-export:${transpileSef}`, "-nogo"]);
run([`-s:${artefactDir("peppol-bis-3")}/rules/sch/PEPPOL-EN16931-UBL.sch`, `-xsl:${transpileSef}`, `-o:${peppolXsl}`]);

const frCtc = path.join(artefactDir("factur-x-wheel"), "facturx/xsd_and_schematron/cii-schematron-fr-ctc/BR-FR-Flux2-Schematron-CII.xslt");

/** id -> { xslt, label, source }. `source` is the human-readable provenance shown in reports. */
export const RULESETS = {
  "en16931-cii": { xslt: `${cen}/cii/xslt/EN16931-CII-validation.xslt`, label: "EN 16931 (CII)", source: `CEN eInvoicing-EN16931 ${ver("cen-en16931")}` },
  "en16931-ubl": { xslt: `${cen}/ubl/xslt/EN16931-UBL-validation.xslt`, label: "EN 16931 (UBL)", source: `CEN eInvoicing-EN16931 ${ver("cen-en16931")}` },
  "xrechnung-cii": { xslt: `${kosit}/xrechnung/3.0.2/xsl/XRechnung-CII-validation.xsl`, label: "XRechnung 3.0 CIUS (CII)", source: `KoSIT validator-configuration-xrechnung ${ver("kosit-xrechnung-config")}` },
  "xrechnung-ubl": { xslt: `${kosit}/xrechnung/3.0.2/xsl/XRechnung-UBL-validation.xsl`, label: "XRechnung 3.0 CIUS (UBL)", source: `KoSIT validator-configuration-xrechnung ${ver("kosit-xrechnung-config")}` },
  "peppol-ubl": { xslt: peppolXsl, label: "Peppol BIS Billing 3.0 (UBL)", source: `OpenPEPPOL peppol-bis-invoice-3 ${ver("peppol-bis-3")}` },
  "fr-ctc": { xslt: frCtc, label: "French CTC BR-FR Flux 2 (CII)", source: `factur-x ${ver("factur-x-wheel")} (FNFE-MPE)` },
};

const sha = (b) => createHash("sha256").update(b).digest("hex");
const report = {};
for (const [id, r] of Object.entries(RULESETS)) {
  const sef = path.join(out, `${id}.sef.json`);
  console.log(`compiling ${id}`);
  run([`-xsl:${r.xslt}`, `-export:${sef}`, "-nogo"]);
  const buf = readFileSync(sef);
  report[id] = { label: r.label, source: r.source, bytes: buf.length, gzipBytes: gzipSync(buf, { level: 9 }).length, sha256: sha(buf) };
}

// Official XSDs, copied verbatim. UBL 2.1 and CII D16B come from the KoSIT bundle (the same files the KoSIT
// validator uses); the Factur-X MINIMUM / BASIC WL / EXTENDED schemas come from the pinned factur-x release.
const xsdOut = path.join(out, "xsd");
rmSync(xsdOut, { recursive: true, force: true });
const ublSrc = `${kosit}/ubl/2.1/xsd`;
cpSync(`${ublSrc}/common`, path.join(xsdOut, "ubl-2.1/common"), { recursive: true });
for (const f of ["UBL-Invoice-2.1.xsd", "UBL-CreditNote-2.1.xsd"]) cpSync(`${ublSrc}/maindoc/${f}`, path.join(xsdOut, "ubl-2.1/maindoc", f));
cpSync(`${kosit}/cii/16b/xsd`, path.join(xsdOut, "cii-d16b"), { recursive: true });
const fx = path.join(artefactDir("factur-x-wheel"), "facturx/xsd_and_schematron");
for (const p of ["extended", "minimum", "basicwl"]) cpSync(`${fx}/facturx-${p}`, path.join(xsdOut, `facturx-${p}`), { recursive: true, filter: (f) => !f.endsWith(".xsl") && !f.endsWith(".xml") });

writeFileSync(path.join(out, "rulesets.json"), JSON.stringify({ generatedFrom: "tools/artefacts.manifest.json", rulesets: report }, null, 2) + "\n");
console.log("compiled. gzipped sizes:");
for (const [id, r] of Object.entries(report)) console.log(`  ${id.padEnd(16)} ${(r.gzipBytes / 1024).toFixed(0)} KB gz  (${(r.bytes / 1048576).toFixed(1)} MB raw)`);
