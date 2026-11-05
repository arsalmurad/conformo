/**
 * A readable place for a rule result. The Schematron reports where it fired as a full XPath with every namespace
 * spelled out (`/Q{urn:...}CrossIndustryInvoice[1]/Q{urn:...}SupplyChainTradeTransaction[1]/...`), which nobody can act
 * on. This reduces it to the element name, the invoice line it sits in (if any) and a short path, and, for amounts
 * that map to one, the business terms (BT ids). Pure string work: same in Node and in a browser.
 */
export interface ResultPlace {
  /** The offending element (or `@attribute` of an element), without namespace, e.g. "LineTotalAmount". */
  element: string;
  /** Short path: the invoice line if any, then the last two element names, e.g. "line 1 > NetPriceProductTradePrice > ChargeAmount". */
  path: string;
  /** 1-based invoice line number when the node is inside an invoice line. */
  line?: number;
  /** BT/BG ids this element maps to (amounts only), or empty. */
  fields: string[];
}

interface Segment { name: string; index: number; attr: boolean }

const SEGMENT = /(?:Q\{[^}]*\}|\*:|[A-Za-z][\w.-]*:)?([A-Za-z_][\w.-]*)(?:\[namespace-uri\(\)='[^']*'\])?(?:\[(\d+)\])?|@([A-Za-z_][\w.:-]*)/g;

function segments(xpath: string): Segment[] {
  const out: Segment[] = [];
  // Segments start after a "/" that is outside Q{...} and [...] , so split manually instead of on every "/".
  let depth = 0;
  let cur = "";
  const parts: string[] = [];
  for (const ch of xpath) {
    if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth--;
    if (ch === "/" && depth === 0) { if (cur) parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) parts.push(cur);
  for (const p of parts) {
    SEGMENT.lastIndex = 0;
    const m = SEGMENT.exec(p);
    if (!m) continue;
    if (m[3]) out.push({ name: m[3], index: 1, attr: true });
    else out.push({ name: m[1]!, index: m[2] ? Number(m[2]) : 1, attr: false });
  }
  return out;
}

const LINE_ITEMS = new Set(["IncludedSupplyChainTradeLineItem", "InvoiceLine", "CreditNoteLine"]);
const ROOTS = new Set(["CrossIndustryInvoice", "Invoice", "CreditNote"]);

/**
 * BT ids for the amount elements an invoice generator most often gets wrong. Keyed "Parent/Element" (CII) or by
 * element alone where the UBL name is unique. Only amounts that map to exactly one business term in that place are
 * listed; anything else is left empty rather than guessed.
 */
const BT: Record<string, string[]> = {
  "SpecifiedTradeSettlementHeaderMonetarySummation/LineTotalAmount": ["BT-106"],
  "SpecifiedTradeSettlementHeaderMonetarySummation/ChargeTotalAmount": ["BT-108"],
  "SpecifiedTradeSettlementHeaderMonetarySummation/AllowanceTotalAmount": ["BT-107"],
  "SpecifiedTradeSettlementHeaderMonetarySummation/TaxBasisTotalAmount": ["BT-109"],
  "SpecifiedTradeSettlementHeaderMonetarySummation/TaxTotalAmount": ["BT-110", "BT-111"],
  "SpecifiedTradeSettlementHeaderMonetarySummation/GrandTotalAmount": ["BT-112"],
  "SpecifiedTradeSettlementHeaderMonetarySummation/TotalPrepaidAmount": ["BT-113"],
  "SpecifiedTradeSettlementHeaderMonetarySummation/RoundingAmount": ["BT-114"],
  "SpecifiedTradeSettlementHeaderMonetarySummation/DuePayableAmount": ["BT-115"],
  "SpecifiedTradeSettlementLineMonetarySummation/LineTotalAmount": ["BT-131"],
  "NetPriceProductTradePrice/ChargeAmount": ["BT-146"],
  "GrossPriceProductTradePrice/ChargeAmount": ["BT-148"],
  "ApplicableTradeTax/CalculatedAmount": ["BT-117"],
  "ApplicableTradeTax/BasisAmount": ["BT-116"],
  LineExtensionAmount: ["BT-131"],
  TaxExclusiveAmount: ["BT-109"],
  TaxInclusiveAmount: ["BT-112"],
  PayableAmount: ["BT-115"],
  PrepaidAmount: ["BT-113"],
  PayableRoundingAmount: ["BT-114"],
  AllowanceTotalAmount: ["BT-107"],
  ChargeTotalAmount: ["BT-108"],
  PriceAmount: ["BT-146"],
};

/** Reads a full XPath as reported by the rule engines; undefined when it has no element in it. */
export function describeLocation(xpath: string): ResultPlace | undefined {
  const segs = segments(xpath);
  if (segs.length === 0) return undefined;
  const last = segs[segs.length - 1]!;
  const lineIdx = segs.findIndex((s) => LINE_ITEMS.has(s.name));
  const line = lineIdx >= 0 ? segs[lineIdx]!.index : undefined;

  const elemSegs = segs.filter((s) => !s.attr);
  const owner = last.attr ? elemSegs[elemSegs.length - 1] : undefined;
  const element = last.attr ? `${owner?.name ?? ""}@${last.name}` : last.name;

  const names = segs.map((s) => (s.attr ? `@${s.name}` : s.name)).filter((n, i) => !(i === 0 && ROOTS.has(n)));
  const tail = names.filter((n) => !LINE_ITEMS.has(n)).slice(-2);
  const path = `${line !== undefined ? `line ${line}${tail.length ? " > " : ""}` : ""}${tail.join(" > ")}`;

  const parent = elemSegs.length >= 2 ? elemSegs[elemSegs.length - 2]!.name : "";
  const own = last.attr ? undefined : last.name;
  const fields = own ? (BT[`${parent}/${own}`] ?? BT[own] ?? []) : [];
  return { element, path, ...(line !== undefined ? { line } : {}), fields: [...fields] };
}
