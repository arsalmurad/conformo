import type { RuleResult } from "./types.js";

/** Parses the SVRL (Schematron Validation Report Language) that SaxonJS
 * produces, without a DOM or an XML-parser dependency. SVRL is a flat,
 * machine-generated format (we control the producer: it is always our own
 * compiled Schematron running against a well-formed XML source), so a
 * tag-scan is reliable here and, unlike a DOMParser, runs identically under
 * Node and in a browser with no environment-specific API.
 *
 * We read `svrl:failed-assert` (an `<sch:assert>` that did not hold) and
 * `svrl:successful-report` (an `<sch:report>` that did, i.e. also a
 * violation — `assert`/`report` are the two ways Schematron authors phrase a
 * rule). Both carry the same attributes.
 */
export function parseSvrl(svrl: string): { results: RuleResult[]; firedCount: number } {
  const results: RuleResult[] = [];
  const violationTag = /<svrl:(failed-assert|successful-report)\b([^>]*)>([\s\S]*?)<\/svrl:\1>/g;
  let match: RegExpExecArray | null;
  while ((match = violationTag.exec(svrl)) !== null) {
    const [, , attrsText, body] = match as unknown as [string, string, string, string];
    const attrs = parseAttrs(attrsText);
    const severity = toSeverity(attrs.flag ?? attrs.role);
    const message = unescapeXml(stripTags(body)).trim();
    const ruleId = leadingBracketId(message) ?? attrs.id ?? "";
    if (!ruleId) continue; // no rule id means nothing a caller can act on or dedupe by
    results.push({
      ruleId,
      severity,
      fields: extractFields(message),
      xpath: unescapeXml(attrs.location ?? ""),
      message,
    });
  }
  const firedCount = countOccurrences(svrl, "<svrl:fired-rule");
  return { results, firedCount };
}

function parseAttrs(attrsText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([\w:-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrsText)) !== null) {
    const [, name, value] = m as unknown as [string, string, string];
    attrs[name] = value;
  }
  return attrs;
}

/** The bundled Factur-X CII Schematron (unlike the French CTC one, and
 * unlike the UBL EN 16931 Schematron in the same pip package) doesn't put the
 * human rule id in `@id` — it emits an opaque generated id there
 * (e.g. "FX-SCH-A-000056") and puts the real id as a "[BR-Z-10]-..." prefix
 * on the message text instead. Confirmed by inspecting actual SVRL output,
 * not assumed: see fixtures/negative/broken-invoice.xml and
 * test/validate.test.ts. We prefer this when present; @id is the fallback
 * for artefacts (like French CTC) that do use it directly. */
function leadingBracketId(message: string): string | undefined {
  return message.match(/^\[([^\]]+)\]/)?.[1];
}

function toSeverity(flag: string | undefined): RuleResult["severity"] {
  const f = (flag ?? "").toLowerCase();
  if (f === "warning" || f === "warn") return "warning";
  if (f === "info" || f === "information") return "info";
  if (f === "fatal") return "fatal";
  return "error"; // the Schematron default when no @flag/@role is given
}

function stripTags(xml: string): string {
  return xml.replace(/<[^>]*>/g, " ");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const FIELD_RE = /\bB[TG]-\d+[a-z]?\b/g;

function extractFields(message: string): string[] {
  const seen = new Set<string>();
  for (const m of message.matchAll(FIELD_RE)) seen.add(m[0]);
  return [...seen];
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count++;
    index += needle.length;
  }
  return count;
}
