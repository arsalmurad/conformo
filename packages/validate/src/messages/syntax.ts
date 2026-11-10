import type { PlainLanguageMessage } from "../types.js";

/**
 * Plain-language messages for the syntax-binding rules of the CEN EN 16931 rule sets: CII-DT-*, CII-SR-*, UBL-CR-*,
 * UBL-DT-* and UBL-SR-*. There are about 1,300 of them (the same few sentences over and over for different element
 * names), and they are exactly the rules an invoice generator trips over, so they are answered by family, built from
 * the publisher's own sentence for the rule (the family and the offending name are read from it), not from a table
 * with one entry per rule id.
 *
 * Each family below was written from what the rules actually test in the CEN XSLT (validation-1.3.17):
 *  - "<name> should not be present" / "shall not be used": `not(@name)` or `not(ram:Element)` on the node.
 *  - UBL-CR "A UBL invoice should not include the <path>": `not(cac:Path)` (the UBL element has no place in the
 *    EN 16931 data model, so a conforming reader ignores it or warns).
 *  - cardinality ("exist maximum once", "must exist exactly once", ...): `count(...) <= 1` or `= 1`.
 * Rules that fit none of these keep the publisher's sentence only; one-off rules get hand-written entries in en.ts.
 */

const FAMILY_ID = /^(CII|UBL)-(DT|SR|CR)-\d+[a-z]*$/;

const clean = (m: string): string => m.replace(/^\s*(?:\[[^\]]*\])?\s*-?\s*/, "").replace(/\s+/g, " ").trim();

const NOT_PRESENT = /^(@?[A-Za-z][A-Za-z0-9 ]*?)(?: attribute)? (?:should not be present|shall not be used|should not be used)\.?$/;
const UBL_NOT_INCLUDE = /^A UBL (?:invoice|credit note) should not include (?:the )?(.+?)\.?$/;
const CARDINALITY = /\b(?:should|shall|must|can only|may)\b[^.]*\b(?:maximum once|at most once|maximum twice|exactly once|only one|more than one|maximum one)\b|\bonly one\b/i;

/** An XML attribute is written lower camel case (currencyID, schemeName), an element upper camel case (ChargeAmount). */
const isAttributeName = (n: string): boolean => n.startsWith("@") || /^[a-z]/.test(n) || / /.test(n);

export function syntaxMessage(ruleId: string, officialMessage: string | undefined): PlainLanguageMessage | undefined {
  if (!officialMessage || !FAMILY_ID.test(ruleId)) return undefined;
  const text = clean(officialMessage);
  const syntax = ruleId.startsWith("CII") ? "CII" : "UBL";

  const crm = UBL_NOT_INCLUDE.exec(text);
  if (crm) {
    const where = crm[1]!;
    return {
      summary: `The UBL element "${where}" is not part of the EN 16931 data model.`,
      why: `EN 16931 does not carry this information in UBL (rule ${ruleId}), so a receiving system has nowhere to put it: it may ignore it or report it.`,
      fix: `Remove "${where}" from the XML. If the information matters to the buyer, send it in a field EN 16931 does have (a note, BT-22, or an attached document, BG-24).`,
    };
  }

  const np = NOT_PRESENT.exec(text);
  if (np) {
    const name = np[1]!.replace(/^@/, "").trim();
    if (isAttributeName(np[1]!)) {
      return {
        summary: `The attribute "${name}" is not allowed on this element.`,
        why: `The ${syntax} syntax binding of EN 16931 fixes which XML attributes each element may carry; this one is not used here (rule ${ruleId}), so a receiving system may reject the file or ignore the value.`,
        fix: `Remove the "${name}" attribute from the element named in the location. Its text content stays as it is.`,
      };
    }
    return {
      summary: `The element "${name}" is not used by EN 16931 at this place.`,
      why: `The ${syntax} syntax binding of EN 16931 does not map this element to any business term (rule ${ruleId}), so a receiving system has nowhere to put it: it may reject the file or ignore the value.`,
      fix: `Remove "${name}" from the XML at the location shown. If the information matters to the buyer, send it in a field EN 16931 does have (a note, BT-22, or an attached document, BG-24).`,
    };
  }

  if (CARDINALITY.test(text)) {
    const exactly = /exactly once/i.test(text);
    return {
      summary: exactly ? `A required ${syntax} element must appear exactly once: ${text}` : `Too many occurrences: ${text}`,
      why: `The ${syntax} binding of EN 16931 limits how often this element may appear (rule ${ruleId}). A reader that expects one value cannot choose between several, and a missing one leaves a mandatory field empty.`,
      fix: exactly
        ? "Make sure the element is written once, in the place the rule names, and not repeated or left out."
        : "Write the element no more often than the rule allows and remove the extra occurrences. If the repeats carry different information, move it to a field that may repeat (for example a note, BT-22).",
    };
  }
  return undefined;
}
