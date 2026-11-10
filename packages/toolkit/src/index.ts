/**
 * @conformo/toolkit: the whole Node API in one place. Everything the CLI, the MCP server and the HTTP API do is a call
 * to one of these functions, so the three cannot drift apart.
 */
import { detectXmlFormat, extractEmbeddedXml, inspectPdfContainer, leitwegNotices, readInvoiceFromPdf } from '@conformo/parse';
import type { PdfInvoiceResult } from '@conformo/parse';
import { summarizeResult, validate as validateXmlText } from '@conformo/validate';
import type { ValidateOptions, ValidationResult } from '@conformo/validate';
import { totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { child, children, descend, parseXml, text } from '@conformo/parse';
import { containerNotices } from './container.js';
import { createXml, FORMAT_IDS } from './formats.js';
import type { CreatedXml, FormatId } from './formats.js';

export { createXml, serialize, FORMAT_IDS, FORMAT_DESCRIPTIONS } from './formats.js';
export type { CreatedXml, FormatId } from './formats.js';
export { containerNotices } from './container.js';
export { leitwegNotices } from '@conformo/parse';
export { createPdf, PDF_PROFILES, PDF_LANGUAGES } from './pdf.js';
export type { PdfLanguage } from './pdf.js';
export type { CreatedPdf, CreatePdfOptions } from './pdf.js';
export { explainRule } from './rules.js';
export type { RuleExplanation } from './rules.js';
export { getRequirements, FORMAT_SUPPORT, SUPPORTED_COUNTRIES } from './requirements.js';
export type { CountryRequirements } from './requirements.js';
export { checkInvoice, InvoiceInputError } from '@conformo/core';
export type { Invoice, InvoiceIssue } from '@conformo/core';
export { ValidationInputError } from '@conformo/validate';
export { groupResults, groupHeading, describePlaces, summarizeResult } from '@conformo/validate';
export type { ValidationResult, ValidateOptions, RuleGroup, RuleResult, ResultSummary } from '@conformo/validate';

export type InvoiceSource = string | Uint8Array;

const isPdf = (b: Uint8Array): boolean => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

/** XML text from either XML text or PDF bytes. */
export async function xmlOf(input: InvoiceSource): Promise<{ xml: string; origin: 'xml' | 'pdf'; embeddedFilename?: string }> {
  if (typeof input === 'string') return { xml: input, origin: 'xml' };
  if (isPdf(input)) {
    const { xml, filename } = await extractEmbeddedXml(input);
    return { xml, origin: 'pdf', embeddedFilename: filename };
  }
  return { xml: new TextDecoder().decode(input), origin: 'xml' };
}

export interface ValidatedDocument extends ValidationResult {
  origin: 'xml' | 'pdf';
  embeddedFilename?: string;
}

/**
 * Validates XML text, XML bytes or a Factur-X/ZUGFeRD PDF (the embedded XML is validated). Syntax and profile come from
 * the document; the result lists exactly which rule sets ran.
 */
export async function validate(input: InvoiceSource, options: ValidateOptions = {}): Promise<ValidatedDocument> {
  const { xml, origin, embeddedFilename } = await xmlOf(input);
  const result = await validateXmlText(xml, options);
  result.notices.push(...leitwegNotices(xml));
  // PDF container: what the file says about itself (XMP schema and version, file name), as notices; never affects `valid`.
  if (origin === 'pdf' && typeof input !== 'string') result.notices.push(...containerNotices(await inspectPdfContainer(input), result.detected));
  result.summary = summarizeResult(result);
  return { ...result, origin, ...(embeddedFilename ? { embeddedFilename } : {}) };
}

/** Did the totals stated in the document survive being recomputed from its lines? Never hidden: a difference is reported. */
export interface TotalsCheck {
  matches: boolean;
  /** One line per total that differs, e.g. "BT-110 VAT total: document 1867900, computed from lines 1867860 (minor units)". */
  differences: string[];
}

export interface ParsedInvoice {
  invoice: Invoice;
  /** Syntax the document was in. */
  format: 'cii' | 'ubl-invoice' | 'ubl-credit-note';
  origin: 'xml' | 'pdf';
  embeddedFilename?: string;
  /** The document's stated BT-109/110/112/115 against the totals computed from its lines. */
  totalsCheck: TotalsCheck;
  /** For a PDF: did the visible totals match the embedded XML? */
  visibleTotals?: PdfInvoiceResult['visibleTotals'];
}

function totalsCheckOf(xml: string, invoice: Invoice): TotalsCheck {
  const root = parseXml(xml);
  const stated: Record<string, string | undefined> = {};
  if (root.name === 'CrossIndustryInvoice') {
    const settle = descend(child(root, 'SupplyChainTradeTransaction'), 'ApplicableHeaderTradeSettlement');
    const ms = child(settle, 'SpecifiedTradeSettlementHeaderMonetarySummation');
    const cur = text(child(settle, 'InvoiceCurrencyCode'));
    const tax = children(ms, 'TaxTotalAmount').find((e) => e.attributes.find((a) => a.name === 'currencyID')?.value === cur) ?? child(ms, 'TaxTotalAmount');
    Object.assign(stated, { taxBasis: text(child(ms, 'TaxBasisTotalAmount')), taxTotal: text(tax), grand: text(child(ms, 'GrandTotalAmount')), due: text(child(ms, 'DuePayableAmount')) });
  } else {
    const lm = child(root, 'LegalMonetaryTotal');
    Object.assign(stated, { taxBasis: text(child(lm, 'TaxExclusiveAmount')), taxTotal: text(descend(root, 'TaxTotal', 'TaxAmount')), grand: text(child(lm, 'TaxInclusiveAmount')), due: text(child(lm, 'PayableAmount')) });
  }
  const computed = totals(invoice);
  const labels = { taxBasis: 'BT-109 total without VAT', taxTotal: 'BT-110 VAT total', grand: 'BT-112 total with VAT', due: 'BT-115 amount due' } as const;
  const differences: string[] = [];
  for (const k of Object.keys(labels) as (keyof typeof labels)[]) {
    const s = stated[k];
    if (s === undefined) continue;
    const got = Math.round(Number(s) * 100);
    if (got !== computed[k]) differences.push(`${labels[k]}: document ${got}, computed from lines ${computed[k]} (minor units)`);
  }
  return { matches: differences.length === 0, differences };
}

/** Reads CII/UBL/XRechnung XML or a hybrid PDF into the EN 16931 model. */
export async function parse(input: InvoiceSource): Promise<ParsedInvoice> {
  if (typeof input !== 'string' && isPdf(input)) {
    const r = await readInvoiceFromPdf(input);
    return { invoice: r.invoice, format: r.format, origin: 'pdf', embeddedFilename: r.xmlFilename, totalsCheck: totalsCheckOf(r.xml, r.invoice), visibleTotals: r.visibleTotals };
  }
  const { xml } = await xmlOf(input);
  const { invoice, format } = detectXmlFormat(xml);
  return { invoice, format, origin: 'xml', totalsCheck: totalsCheckOf(xml, invoice) };
}

export interface ConvertedInvoice extends CreatedXml {
  from: ParsedInvoice['format'];
  /** Whether the source's stated totals equal the totals the converted document will carry. */
  totalsCheck: TotalsCheck;
}

/** Reads any supported document and writes it in another flavour. Fields the target does not carry are not invented. */
export async function convert(input: InvoiceSource, to: FormatId): Promise<ConvertedInvoice> {
  if (!FORMAT_IDS.includes(to)) throw new Error(`unknown target format "${to}"; use one of ${FORMAT_IDS.join(', ')}`);
  const parsed = await parse(input);
  const created = createXml(parsed.invoice, to);
  if (!parsed.totalsCheck.matches) created.warnings.push(...parsed.totalsCheck.differences.map((d) => `totals differ from the source document: ${d}`));
  return { ...created, from: parsed.format, totalsCheck: parsed.totalsCheck };
}
