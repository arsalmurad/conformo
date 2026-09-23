/**
 * Format sniffing by root element name + namespace URI, never by file
 * extension or a guess from content. XRechnung and Peppol are profiles of CII
 * or UBL (same root element, a different customization ID inside), so they
 * are not separate cases here — readCII()/readUBL() already read every term
 * either profile can carry.
 */
import { CII_NS, UBL_NS } from '@invoice-engine/formats';
import type { Invoice } from '@invoice-engine/core';
import { parseXml } from './xml/parseXml.js';
import type { ParseXmlOptions } from './xml/parseXml.js';
import { readCII } from './cii/readCII.js';
import { readUBL } from './ubl/readUBL.js';

export type XmlInvoiceFormat = 'cii' | 'ubl-invoice' | 'ubl-credit-note';

export class UnrecognizedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnrecognizedFormatError';
  }
}

export function detectXmlFormat(source: string, options: ParseXmlOptions = {}): { format: XmlInvoiceFormat; invoice: Invoice } {
  const root = parseXml(source, options);
  if (root.name === 'CrossIndustryInvoice' && root.namespaceURI === CII_NS.rsm) {
    return { format: 'cii', invoice: readCII(root) };
  }
  if (root.name === 'Invoice' && root.namespaceURI === UBL_NS.invoice) {
    return { format: 'ubl-invoice', invoice: readUBL(root) };
  }
  if (root.name === 'CreditNote' && root.namespaceURI === UBL_NS.creditNote) {
    return { format: 'ubl-credit-note', invoice: readUBL(root) };
  }
  throw new UnrecognizedFormatError(
    `Unrecognized root element <${root.name}> in namespace ${root.namespaceURI ?? '(none)'}; expected a CII CrossIndustryInvoice or a UBL Invoice/CreditNote`,
  );
}
