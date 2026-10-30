import type { DetectedDocument, Profile, Syntax } from "./types.js";
import { ValidationInputError } from "./types.js";

const first = (xml: string, re: RegExp): string | undefined => re.exec(xml)?.[1]?.trim();

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
  let businessProcess: string | undefined;
  if (local === "CrossIndustryInvoice") {
    syntax = "cii";
    customizationId = first(xml, /<(?:\w+:)?GuidelineSpecifiedDocumentContextParameter\b[^>]*>\s*<(?:\w+:)?ID\b[^>]*>([^<]*)</);
    businessProcess = first(xml, /<(?:\w+:)?BusinessProcessSpecifiedDocumentContextParameter\b[^>]*>\s*<(?:\w+:)?ID\b[^>]*>([^<]*)</);
  } else if (local === "Invoice" || local === "CreditNote") {
    if (!/urn:oasis:names:specification:ubl:schema:xsd:(Invoice|CreditNote)-2/.test(stripped.slice(0, 2000))) {
      throw new ValidationInputError(`<${local}> is not in a UBL 2.1 Invoice/CreditNote namespace.`);
    }
    syntax = local === "Invoice" ? "ubl-invoice" : "ubl-creditnote";
    customizationId = first(xml, /<(?:\w+:)?CustomizationID\b[^>]*>([^<]*)</);
    businessProcess = first(xml, /<(?:\w+:)?ProfileID\b[^>]*>([^<]*)</);
  } else {
    throw new ValidationInputError(
      `Unsupported document <${local}>. Supported: UN/CEFACT CII (CrossIndustryInvoice) and UBL 2.1 (Invoice, CreditNote).`);
  }
  return { syntax, customizationId, businessProcess, profile: profileFromCustomizationId(customizationId) };
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
