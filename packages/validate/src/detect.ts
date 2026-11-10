import type { DetectedDocument, Profile, Syntax } from "./types.js";
import { ValidationInputError } from "./types.js";

const first = (xml: string, re: RegExp): string | undefined => re.exec(xml)?.[1]?.trim();
const firstRaw = (xml: string, re: RegExp): string | undefined => re.exec(xml)?.[1];

/** The XRechnung 3.0 identifiers the KoSIT validator configuration (scenarios.xml, 3.0.2) matches by exact text
 * equality: its build properties xrechnung.spec.id, xrechnung.extension.id and xrechnung.cvd.id. */
export const KOSIT_XRECHNUNG_IDS = {
  standard: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
  extension: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0",
  cvd: "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#compliant#urn:xeinkauf.de:kosit:xrechnung:cvd_0.9",
} as const;

/** KoSIT has no extension scenario for a UBL CreditNote, so that combination is also rejected there. */
export function kositXrechnungIds(syntax: Syntax): string[] {
  return syntax === "ubl-creditnote" ? [KOSIT_XRECHNUNG_IDS.standard, KOSIT_XRECHNUNG_IDS.cvd] : Object.values(KOSIT_XRECHNUNG_IDS);
}

/** True when BT-24 reads as meant for XRechnung (names xrechnung, xeinkauf or kosit) but is not, character for character,
 * an identifier the KoSIT validator has a scenario for. Leading and trailing whitespace counts, as in KoSIT. */
export function isUnknownXrechnungId(syntax: Syntax, raw: string | undefined): boolean {
  if (raw === undefined || !/xrechnung|xeinkauf|kosit/i.test(raw)) return false;
  return !kositXrechnungIds(syntax).includes(raw);
}

/** Reads the syntax from the root element and the profile from BT-24, without a DOM or XML parser
 * (so it behaves identically in Node and in a browser). Throws ValidationInputError for anything
 * that is not a CII or UBL invoice, instead of validating it against rules that cannot apply. */
export function detectDocument(xml: string): DetectedDocument {
  // Skip the prolog, comments and PIs, then read the first element's name.
  const stripped = xml.replace(/^﻿/, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const root = /<(?:([\w.-]+):)?([\w.-]+)[\s>/]/.exec(stripped);
  if (!root) throw new ValidationInputError("This does not look like XML: no root element found.");
  const local = root[2]!;
  let syntax: Syntax;
  let customizationId: string | undefined;
  let customizationIdRaw: string | undefined;
  let businessProcess: string | undefined;
  if (local === "CrossIndustryInvoice") {
    syntax = "cii";
    const re = /<(?:\w+:)?GuidelineSpecifiedDocumentContextParameter\b[^>]*>\s*<(?:\w+:)?ID\b[^>]*>([^<]*)</;
    customizationId = first(xml, re);
    customizationIdRaw = firstRaw(xml, re);
    businessProcess = first(xml, /<(?:\w+:)?BusinessProcessSpecifiedDocumentContextParameter\b[^>]*>\s*<(?:\w+:)?ID\b[^>]*>([^<]*)</);
  } else if (local === "Invoice" || local === "CreditNote") {
    if (!/urn:oasis:names:specification:ubl:schema:xsd:(Invoice|CreditNote)-2/.test(stripped.slice(0, 2000))) {
      throw new ValidationInputError(`<${local}> is not in a UBL 2.1 Invoice/CreditNote namespace.`);
    }
    syntax = local === "Invoice" ? "ubl-invoice" : "ubl-creditnote";
    const re = /<(?:\w+:)?CustomizationID\b[^>]*>([^<]*)</;
    customizationId = first(xml, re);
    customizationIdRaw = firstRaw(xml, re);
    businessProcess = first(xml, /<(?:\w+:)?ProfileID\b[^>]*>([^<]*)</);
  } else if (local === "Faktura" && /http:\/\/crd\.gov\.pl\/wzor\/2025\/06\/25\/13775\//.test(stripped.slice(0, 3000))) {
    // Polish KSeF FA(3). There is no CEN-style Schematron for it; the schema is the check Conformo can run.
    return { syntax: "ksef-fa3", profile: "unknown" };
  } else {
    throw new ValidationInputError(
      `Unsupported document <${local}>. Supported: UN/CEFACT CII (CrossIndustryInvoice), UBL 2.1 (Invoice, CreditNote) and Polish KSeF FA(3) (Faktura, schema only).`);
  }
  const profile = profileFromCustomizationId(customizationId);
  const lower = customizationId?.toLowerCase() ?? "";
  const variant = profile !== "xrechnung" ? undefined : lower.includes(":extension:") ? "extension" : lower.includes(":cvd_") ? "cvd" : "standard";
  return { syntax, customizationId, ...(customizationIdRaw !== undefined && customizationIdRaw !== customizationId ? { customizationIdRaw } : {}), businessProcess, profile, ...(variant ? { variant } : {}) };
}

/** BT-24 -> the profile that decides which CIUS rule sets apply. */
export function profileFromCustomizationId(id: string | undefined): Profile {
  if (!id) return "unknown";
  const v = id.toLowerCase();
  if (v.includes("xrechnung")) return "xrechnung";
  if (v.includes("peppol.eu:2017:poacc:billing:3.0")) return "peppol";
  if (/(^|:)(factur-x\.eu:1p0|zugferd\.de:2p0):minimum$/.test(v)) return "minimum";
  if (/(^|:)(factur-x\.eu:1p0|zugferd\.de:2p0):basicwl$/.test(v)) return "basicwl";
  if (v.includes(":extended")) return "extended";
  if (v.startsWith("urn:cen.eu:en16931:2017")) return "en16931";
  return "unknown";
}
