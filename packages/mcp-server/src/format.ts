/**
 * One place mapping the MCP tools' `format` argument to the actual
 * serializer, shared by create_invoice and convert_invoice so the two tools
 * can't drift on what "xrechnung-cii" means.
 */
import { buildCII, buildUBL, buildXRechnungCII, buildXRechnungUBL } from '@invoice-engine/formats';
import type { Invoice } from '@invoice-engine/core';

export const FORMAT_IDS = ['cii', 'ubl', 'xrechnung-cii', 'xrechnung-ubl', 'peppol-ubl'] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

export function serialize(invoice: Invoice, format: FormatId): string {
  switch (format) {
    case 'cii': return buildCII(invoice);
    case 'ubl': return buildUBL(invoice);
    case 'xrechnung-cii': return buildXRechnungCII(invoice);
    case 'xrechnung-ubl': return buildXRechnungUBL(invoice);
    case 'peppol-ubl': return buildUBL(invoice, { profile: 'peppol' });
  }
}
