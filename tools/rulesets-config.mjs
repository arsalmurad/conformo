// Where each runtime rule set comes from. Shared by tools/build-rulesets.mjs (compiles them) and the conformance
// run (feeds the same XSLT files to Saxon-HE as the reference).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artefactDir, manifest } from "./fetch-artefacts.mjs";

export const TMP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "artefacts/.tmp");
export const PEPPOL_XSL = path.join(TMP_DIR, "peppol-ubl.xsl");

export function rulesetSources() {
  const kosit = artefactDir("kosit-xrechnung-config") + "/resources";
  const cen = artefactDir("cen-en16931");
  const ver = (id) => manifest.artefacts[id].version;
  const peppolXsl = PEPPOL_XSL;
  const frCtc = path.join(artefactDir("factur-x-wheel"), "facturx/xsd_and_schematron/cii-schematron-fr-ctc/BR-FR-Flux2-Schematron-CII.xslt");

/** id -> { xslt, label, source }. `source` is the human-readable provenance shown in reports. */
return {
  "en16931-cii": { xslt: `${cen}/cii/xslt/EN16931-CII-validation.xslt`, label: "EN 16931 (CII)", source: `CEN eInvoicing-EN16931 ${ver("cen-en16931")}` },
  "en16931-ubl": { xslt: `${cen}/ubl/xslt/EN16931-UBL-validation.xslt`, label: "EN 16931 (UBL)", source: `CEN eInvoicing-EN16931 ${ver("cen-en16931")}` },
  "xrechnung-cii": { xslt: `${kosit}/xrechnung/3.0.2/xsl/XRechnung-CII-validation.xsl`, label: "XRechnung 3.0 CIUS (CII)", source: `KoSIT validator-configuration-xrechnung ${ver("kosit-xrechnung-config")}` },
  "xrechnung-ubl": { xslt: `${kosit}/xrechnung/3.0.2/xsl/XRechnung-UBL-validation.xsl`, label: "XRechnung 3.0 CIUS (UBL)", source: `KoSIT validator-configuration-xrechnung ${ver("kosit-xrechnung-config")}` },
  "peppol-ubl": { xslt: peppolXsl, label: "Peppol BIS Billing 3.0 (UBL)", source: `OpenPEPPOL peppol-bis-invoice-3 ${ver("peppol-bis-3")}` },
  "fr-ctc": { xslt: frCtc, label: "French CTC BR-FR Flux 2 (CII)", source: `factur-x ${ver("factur-x-wheel")} (FNFE-MPE)` },
  };
}



// Runtime patches: small, exact source edits applied to a publisher's XSLT before it is compiled to SEF for SaxonJS.
// Why they exist: SaxonJS 2.7 implements xs:integer with JavaScript doubles (exact only up to 2^53, about 16 digits),
// while Saxon-HE (the reference, and the KoSIT validator) uses arbitrary precision. The IBAN check in the KoSIT
// XRechnung rules and in the Peppol rules casts the rearranged IBAN digit string (up to 34 digits) to xs:integer and
// takes `mod 97`, which gives wrong answers in SaxonJS (e.g. DE89370400440532013000 is reported as invalid, BR-DE-19).
// xs:decimal is arbitrary precision in SaxonJS, so the cast is changed to xs:decimal. Nothing else is touched.
// Each patch must match EXACTLY `count` times in each ruleset it names, or the build fails: a new publisher release
// that changes the function is noticed instead of being compiled unpatched. The conformance run compares verdicts
// against the UNPATCHED publisher XSLT in Saxon-HE (see docs/CONFORMANCE.md, "Runtime patches").
export const runtimePatches = [
  {
    id: "iban-mod97-decimal",
    rulesets: { "xrechnung-cii": 1, "xrechnung-ubl": 1, "peppol-ubl": 3 },
    find: "xs:integer(string-join(for $cp in string-to-codepoints(concat(",
    replace: "xs:decimal(string-join(for $cp in string-to-codepoints(concat(",
    reason: "SaxonJS computes xs:integer with doubles; the IBAN mod-97 check needs up to 34 digits",
  },
];

/** The base URI baked into every compiled rule set: a fixed, non-resolvable name, so no local path ends up in a package. */
export const PUBLIC_BASE = "https://conformo.invalid/rulesets/";

/** Applies the runtime patches for `id` and pins the stylesheet's base URI. Throws unless every patch matches exactly its count. */
export function patchedSource(id, text) {
  let out = text;
  const applied = [];
  for (const p of runtimePatches) {
    const want = p.rulesets[id];
    if (want === undefined) continue;
    const found = out.split(p.find).length - 1;
    if (found !== want) throw new Error(`runtime patch "${p.id}": expected ${want} match(es) in ${id}, found ${found}. The publisher's XSLT changed; review tools/rulesets-config.mjs.`);
    out = out.split(p.find).join(p.replace);
    applied.push(p.id);
  }
  const root = /<(?:xsl:)?(?:stylesheet|transform)(?=[\s>])[^>]*>/.exec(out);
  if (!root) throw new Error(`${id}: no xsl:stylesheet / xsl:transform root element found`);
  if (/\sxml:base=/.test(root[0])) throw new Error(`${id}: root element already has xml:base`);
  out = out.replace(root[0], root[0].replace(/>$/, ` xml:base="${PUBLIC_BASE}${id}.xsl">`));
  return { text: out, applied };
}
