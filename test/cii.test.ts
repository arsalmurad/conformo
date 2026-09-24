import { describe, it, expect } from 'vitest';
import { buildCII } from '@conformo/formats';
import type { Invoice } from '@conformo/core';
import sample from '../fixtures/sample-invoice.json' with { type: 'json' };

const inv = sample as unknown as Invoice;

describe('CII serializer: the ordering traps', () => {
  const xml = buildCII(inv);

  it('emits ChargeTotalAmount BEFORE AllowanceTotalAmount', () => {
    expect(xml.indexOf('ChargeTotalAmount')).toBeLessThan(xml.indexOf('AllowanceTotalAmount'));
  });

  it('always emits ApplicableHeaderTradeDelivery even when empty', () => {
    expect(xml).toContain('<ram:ApplicableHeaderTradeDelivery/>');
  });

  it('puts URIUniversalCommunication after the address, before the tax registration', () => {
    const a = xml.indexOf('PostalTradeAddress');
    const u = xml.indexOf('URIUniversalCommunication');
    const t = xml.indexOf('SpecifiedTaxRegistration');
    expect(a).toBeLessThan(u);
    expect(u).toBeLessThan(t);
  });

  it('declares the EN 16931 guideline', () => {
    expect(xml).toContain('urn:cen.eu:en16931:2017');
  });

  it('escapes XML metacharacters in free text', () => {
    const x = buildCII({ ...inv, seller: { ...inv.seller, name: 'A & B <Ltd>' } });
    expect(x).toContain('A &amp; B &lt;Ltd&gt;');
    expect(x).not.toContain('<Ltd>');
  });
});

describe('French CTC requirements that EN 16931 does not ask for', () => {
  const xml = buildCII(inv);
  it('carries the three mandatory French mentions AAB, PMD and PMT', () => {
    for (const code of ['AAB', 'PMD', 'PMT']) {
      expect(xml).toContain(`<ram:SubjectCode>${code}</ram:SubjectCode>`);
    }
  });
  it('carries BT-23 business process from the allowed list', () => {
    expect(xml).toMatch(/BusinessProcessSpecifiedDocumentContextParameter><ram:ID>(B1|S1|M1|B2|S2|M2|S3|B4|S4|M4|S5|S6|B7|S7|B8|S8|M8|B9|S9|M9)</);
  });
  it('carries BT-34 and BT-49 electronic addresses for both parties', () => {
    expect((xml.match(/URIUniversalCommunication/g) ?? []).length).toBe(4);
  });
});
