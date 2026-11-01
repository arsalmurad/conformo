import { assertInvoice, checkInvoice } from '@conformo/core';
import type { Invoice, InvoiceIssue } from '@conformo/core';
import { buildCII, buildKsefFa3, buildUBL, buildXRechnungCII, buildXRechnungUBL, checkXRechnung } from '@conformo/formats';

/** Every XML flavour Conformo can write. */
export const FORMAT_IDS = ['cii', 'cii-extended', 'ubl', 'xrechnung-cii', 'xrechnung-ubl', 'peppol-ubl', 'ksef-fa3'] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

export const FORMAT_DESCRIPTIONS: Record<FormatId, string> = {
  cii: 'UN/CEFACT CII, EN 16931 (Factur-X / ZUGFeRD EN 16931 profile, a.k.a. COMFORT)',
  'cii-extended': 'UN/CEFACT CII declared as Factur-X / ZUGFeRD EXTENDED (EN 16931 content only; no EXTENDED-only fields)',
  ubl: 'UBL 2.1 Invoice or CreditNote, EN 16931',
  'xrechnung-cii': 'XRechnung 3.x in CII syntax (German CIUS)',
  'xrechnung-ubl': 'XRechnung 3.x in UBL syntax (German CIUS)',
  'peppol-ubl': 'Peppol BIS Billing 3.0 (UBL)',
  'ksef-fa3': 'Polish KSeF FA(3), PLN domestic invoices only; written and schema-checked, never submitted',
};

export interface CreatedXml {
  xml: string;
  format: FormatId;
  /** checkInvoice() warnings and, for XRechnung, the German precondition warnings. Errors throw instead. */
  warnings: string[];
}

/** Serializes to the given flavour. Throws InvoiceInputError (with every issue) for a model that cannot be written. */
export function createXml(invoice: Invoice, format: FormatId): CreatedXml {
  assertInvoice(invoice);
  const warnings = checkInvoice(invoice).filter((i) => i.severity === 'warning').map(fmtIssue);
  if (format.startsWith('xrechnung')) {
    warnings.push(...checkXRechnung(invoice).filter((i) => i.severity === 'warning').map((i) => `[${i.rule}] ${i.message}`));
  }
  return { xml: serialize(invoice, format), format, warnings };
}

export function serialize(invoice: Invoice, format: FormatId): string {
  switch (format) {
    case 'cii': return buildCII(invoice);
    case 'cii-extended': return buildCII(invoice, { profile: 'extended' });
    case 'ubl': return buildUBL(invoice);
    case 'xrechnung-cii': return buildXRechnungCII(invoice);
    case 'xrechnung-ubl': return buildXRechnungUBL(invoice);
    case 'peppol-ubl': return buildUBL(invoice, { profile: 'peppol' });
    case 'ksef-fa3': return buildKsefFa3(invoice);
  }
}

export const fmtIssue = (i: InvoiceIssue): string => `${i.path || '(invoice)'}${i.bt ? ` [${i.bt}]` : ''}: ${i.message}`;
