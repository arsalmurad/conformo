/**
 * @conformo/toolkit: the whole Node API in one place. Everything the CLI, the MCP server and the HTTP API do is a call
 * to one of these functions, so the three cannot drift apart.
 */
import { detectXmlFormat, extractEmbeddedXml, readInvoiceFromPdf } from '@conformo/parse';
import type { PdfInvoiceResult } from '@conformo/parse';
import { validate as validateXmlText } from '@conformo/validate';
import type { ValidateOptions, ValidationResult } from '@conformo/validate';
import type { Invoice } from '@conformo/core';
import { createXml, FORMAT_IDS } from './formats.js';
import type { CreatedXml, FormatId } from './formats.js';

export { createXml, serialize, FORMAT_IDS, FORMAT_DESCRIPTIONS } from './formats.js';
export type { CreatedXml, FormatId } from './formats.js';
export { createPdf, PDF_PROFILES } from './pdf.js';
export type { CreatedPdf, CreatePdfOptions } from './pdf.js';
export { explainRule } from './rules.js';
export type { RuleExplanation } from './rules.js';
export { getRequirements, FORMAT_SUPPORT, SUPPORTED_COUNTRIES } from './requirements.js';
export type { CountryRequirements } from './requirements.js';
export { checkInvoice, InvoiceInputError } from '@conformo/core';
export type { Invoice, InvoiceIssue } from '@conformo/core';
export { ValidationInputError } from '@conformo/validate';
export type { ValidationResult, ValidateOptions } from '@conformo/validate';

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
  return { ...(await validateXmlText(xml, options)), origin, ...(embeddedFilename ? { embeddedFilename } : {}) };
}

export interface ParsedInvoice {
  invoice: Invoice;
  /** Syntax the document was in. */
  format: 'cii' | 'ubl-invoice' | 'ubl-credit-note';
  origin: 'xml' | 'pdf';
  embeddedFilename?: string;
  /** For a PDF: did the visible totals match the embedded XML? */
  visibleTotals?: PdfInvoiceResult['visibleTotals'];
}

/** Reads CII/UBL/XRechnung XML or a hybrid PDF into the EN 16931 model. */
export async function parse(input: InvoiceSource): Promise<ParsedInvoice> {
  if (typeof input !== 'string' && isPdf(input)) {
    const r = await readInvoiceFromPdf(input);
    return { invoice: r.invoice, format: r.format, origin: 'pdf', embeddedFilename: r.xmlFilename, visibleTotals: r.visibleTotals };
  }
  const { xml } = await xmlOf(input);
  const { invoice, format } = detectXmlFormat(xml);
  return { invoice, format, origin: 'xml' };
}

export interface ConvertedInvoice extends CreatedXml {
  from: ParsedInvoice['format'];
}

/** Reads any supported document and writes it in another flavour. Fields the target does not carry are not invented. */
export async function convert(input: InvoiceSource, to: FormatId): Promise<ConvertedInvoice> {
  if (!FORMAT_IDS.includes(to)) throw new Error(`unknown target format "${to}"; use one of ${FORMAT_IDS.join(', ')}`);
  const parsed = await parse(input);
  return { ...createXml(parsed.invoice, to), from: parsed.format };
}
