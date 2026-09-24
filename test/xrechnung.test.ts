import { describe, it, expect } from 'vitest';
import { buildXRechnungCII, buildXRechnungUBL, checkXRechnung, isValidLeitwegId, leitwegCheckDigits, XRechnungError } from '@verinvoice/formats';
import type { Invoice } from '@verinvoice/core';
import xrechnungFixture from '../fixtures/xrechnung-public-sector.json' with { type: 'json' };
import sample from '../fixtures/sample-invoice.json' with { type: 'json' };

const inv = xrechnungFixture as unknown as Invoice;

describe('Leitweg-ID check digits (ISO 7064 MOD 97-10)', () => {
  it('reproduces the published examples', () => {
    expect(leitwegCheckDigits('99290009')).toBe('96');
    expect(leitwegCheckDigits('040110001234512345')).toBe('06');
  });
  it('validates a well-formed ID and rejects a corrupted one', () => {
    expect(isValidLeitwegId('992-90009-96')).toBe(true);
    expect(isValidLeitwegId('04011000-1234512345-06')).toBe(true);
    expect(isValidLeitwegId('992-90009-00')).toBe(false);
  });
});

describe('XRechnung profile', () => {
  it('serializes CII with the XRechnung CustomizationID', () => {
    const xml = buildXRechnungCII(inv);
    expect(xml).toContain('urn:xoev-de:kosit:standard:xrechnung_3.0');
  });

  it('serializes UBL with the XRechnung CustomizationID', () => {
    const xml = buildXRechnungUBL(inv);
    expect(xml).toContain('urn:xoev-de:kosit:standard:xrechnung_3.0');
  });

  it('reports no errors for a fixture that already has BG-6 and the Leitweg-ID', () => {
    expect(checkXRechnung(inv).filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('refuses to serialize an invoice missing the mandatory seller contact (BR-DE-2)', () => {
    const bad: Invoice = { ...inv, seller: { ...inv.seller, contact: undefined } };
    expect(() => buildXRechnungCII(bad)).toThrow(XRechnungError);
    try {
      buildXRechnungCII(bad);
    } catch (e) {
      expect(e).toBeInstanceOf(XRechnungError);
      expect((e as XRechnungError).issues.map((i) => i.rule)).toEqual(
        expect.arrayContaining(['BR-DE-2/5', 'BR-DE-2/6', 'BR-DE-2/7']));
    }
  });

  it('warns, but does not block, on a Leitweg-ID-shaped reference with wrong check digits', () => {
    const wrong: Invoice = { ...inv, buyerReference: '992-90009-00' };
    const issues = checkXRechnung(wrong);
    expect(issues.some((i) => i.severity === 'warning' && i.rule === 'BR-DE-15')).toBe(true);
  });

  it('the generic sample fixture (no German contact) fails the precondition check', () => {
    expect(() => buildXRechnungCII(sample as unknown as Invoice)).toThrow(/BR-DE/);
  });
});
