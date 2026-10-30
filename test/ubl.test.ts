import { describe, it, expect } from 'vitest';
import { checkInvoice } from '@conformo/core';
import { buildUBL } from '@conformo/formats';
import type { Invoice } from '@conformo/core';
import sample from '../fixtures/sample-invoice.json' with { type: 'json' };
import creditNote from '../fixtures/credit-note.json' with { type: 'json' };
import peppolFixture from '../fixtures/peppol-belgium-full.json' with { type: 'json' };

const inv = sample as unknown as Invoice;

describe('UBL serializer', () => {
  it('emits an Invoice root with the EN 16931 CustomizationID', () => {
    const xml = buildUBL(inv);
    expect(xml).toContain('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
    expect(xml).toContain('<cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>');
  });

  it('switches to a CreditNote root for typeCode 381, with CreditedQuantity lines', () => {
    const xml = buildUBL(creditNote as unknown as Invoice);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<CreditNote ')).toBe(true);
    expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
    expect(xml).toContain('<cac:CreditNoteLine>');
    expect(xml).toContain('<cbc:CreditedQuantity');
    expect(xml).not.toContain('<cbc:InvoicedQuantity');
    // BG-3: the preceding invoice this credit note corrects.
    expect(xml).toContain('<cac:InvoiceDocumentReference><cbc:ID>RE-2026-0300</cbc:ID>');
  });

  it('uses the Peppol BIS 3.0 CustomizationID and ProfileID under the peppol profile', () => {
    const xml = buildUBL(peppolFixture as unknown as Invoice, { profile: 'peppol' });
    expect(xml).toContain('urn:fdc:peppol.eu:2017:poacc:billing:3.0');
    expect(xml).toContain('<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>');
    // EAS-scheme electronic addresses become EndpointID with a schemeID attribute.
    expect(xml).toContain('<cbc:EndpointID schemeID="0208">0123456749</cbc:EndpointID>');
  });

  it('attributes a document allowance to its VAT breakdown, matching totals()', () => {
    const withAllowance: Invoice = {
      ...inv,
      allowances: [{ amountMinor: 1000, taxCategory: 'S', taxRate: 20, reason: 'Loyalty' }],
    };
    const xml = buildUBL(withAllowance);
    expect(xml).toContain('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
    expect(xml).toContain('<cbc:AllowanceChargeReason>Loyalty</cbc:AllowanceChargeReason>');
  });

  it('escapes XML metacharacters in free text', () => {
    const xml = buildUBL({ ...inv, seller: { ...inv.seller, name: 'A & B <Ltd>' } });
    expect(xml).toContain('A &amp; B &lt;Ltd&gt;');
    expect(xml).not.toContain('<Ltd>');
  });

  it('never mislabels a legal id that has no scheme (regression for F6): no default scheme is written, checkInvoice warns', () => {
    const bad: Invoice = { ...inv, seller: { ...inv.seller, legalId: '123456789', legalIdScheme: undefined } };
    const xml = buildUBL(bad);
    expect(xml).toMatch(/<cbc:CompanyID>123456789<\/cbc:CompanyID>/); // present, with no schemeID attribute at all
    expect(xml).not.toMatch(/CompanyID schemeID=/);
    expect(checkInvoice(bad).find((i) => i.path === 'seller.legalIdScheme')).toMatchObject({ severity: 'warning', bt: 'BT-30' });
  });
});
