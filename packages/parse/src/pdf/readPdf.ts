import type { Invoice } from '@conformo/core';
import { extractEmbeddedXml } from './extractXml.js';
import { verifyVisibleTotals } from './visibleTotals.js';
import type { VisibleTotalsCheck } from './visibleTotals.js';
import { detectXmlFormat } from '../detect.js';
import type { XmlInvoiceFormat } from '../detect.js';

export interface PdfInvoiceResult {
  format: XmlInvoiceFormat;
  invoice: Invoice;
  xmlFilename: string;
  /** The raw extracted XML text, e.g. to run it through @conformo/validate
   * (which validates CII XML text, not an Invoice object). */
  xml: string;
  visibleTotals: VisibleTotalsCheck;
}

/**
 * Extracts the embedded invoice XML from a Factur-X/ZUGFeRD PDF and cross-checks
 * it against the PDF's own rendered totals (see visibleTotals.ts). Throws
 * NoEmbeddedXmlError / UnrecognizedFormatError / XmlSecurityError /
 * XmlSyntaxError exactly as the plain-XML path does — a caller that already
 * handles those for detectXmlFormat() needs no separate handling here.
 */
export async function readInvoiceFromPdf(pdfBytes: Uint8Array): Promise<PdfInvoiceResult> {
  const { filename, xml } = await extractEmbeddedXml(pdfBytes);
  const { format, invoice } = detectXmlFormat(xml);
  const visibleTotals = await verifyVisibleTotals(pdfBytes, invoice);
  return { format, invoice, xmlFilename: filename, xml, visibleTotals };
}
