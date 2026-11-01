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


