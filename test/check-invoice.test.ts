import { describe, it, expect } from 'vitest';
import { checkInvoice, InvoiceInputError, lineNet, totals, priceToMajor, priceFromMajor } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { buildCII, buildUBL, buildXRechnungCII } from '@conformo/formats';
import sample from '../fixtures/sample-invoice.json' with { type: 'json' };

const ok = sample as unknown as Invoice;

describe('checkInvoice(): structured issues instead of a TypeError', () => {
  it('finds nothing wrong with a valid invoice', () => {
    expect(checkInvoice(ok).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('lists every problem with path, BT id, severity and message', () => {
    const issues = checkInvoice({ seller: { name: '' }, buyer: {}, lines: [{ quantity: 'x' }] });
    const byPath = Object.fromEntries(issues.map((i) => [i.path, i]));
    expect(byPath['number']).toMatchObject({ bt: 'BT-1', severity: 'error' });
    expect(byPath['issueDate']).toMatchObject({ bt: 'BT-2' });
    expect(byPath['currency']).toMatchObject({ bt: 'BT-5' });
    expect(byPath['seller.name']).toMatchObject({ bt: 'BT-27' });
    expect(byPath['seller.country']).toMatchObject({ bt: 'BT-40' });
    expect(byPath['buyer.country']).toMatchObject({ bt: 'BT-55' });
    expect(byPath['lines[0].name']).toMatchObject({ bt: 'BT-153' });
    expect(byPath['lines[0].quantity']).toMatchObject({ bt: 'BT-129' });
    expect(byPath['lines[0].unitPriceMinor']).toMatchObject({ bt: 'BT-146' });
    expect(byPath['lines[0].taxCategory']).toMatchObject({ bt: 'BT-151' });
  });

  it('rejects non-objects and float money', () => {
    expect(checkInvoice(null)[0]!.message).toMatch(/expected an invoice object/);
    const bad = { ...ok, prepaidMinor: 12.5 };
    expect(checkInvoice(bad).some((i) => i.path === 'prepaidMinor' && i.severity === 'error')).toBe(true);
  });

  it('flags impossible dates and mutually exclusive terms', () => {
    expect(checkInvoice({ ...ok, issueDate: '2026-02-30' }).some((i) => i.path === 'issueDate')).toBe(true);
    expect(checkInvoice({ ...ok, taxPointDate: '2026-01-01', taxPointDateCode: '3' }).some((i) => i.bt === 'BT-7')).toBe(true);
  });

  it('treats a missing payment (BG-16) as a warning, not a crash', () => {
    const { payment: _p, ...noPayment } = ok;
    const issues = checkInvoice(noPayment);
    expect(issues.find((i) => i.path === 'payment')).toMatchObject({ severity: 'warning', bt: 'BG-16' });
    expect(() => buildCII(noPayment as Invoice)).not.toThrow();
    expect(() => buildUBL(noPayment as Invoice)).not.toThrow();
  });
});

describe('every serializer throws InvoiceInputError, never a TypeError', () => {
  const broken = { number: 'X', lines: [] } as unknown as Invoice;
  for (const [name, fn] of [['buildCII', buildCII], ['buildUBL', buildUBL]] as const) {
    it(`${name}`, () => {
      let caught: unknown;
      try { fn(broken); } catch (e) { caught = e; }
      expect(caught).toBeInstanceOf(InvoiceInputError);
      const err = caught as InvoiceInputError;
      expect(err.issues.length).toBeGreaterThan(3);
      expect(err.message).toMatch(/seller/);
      expect(err.message).toMatch(/BR-16|at least one invoice line/);
    });
  }
  it('buildXRechnungCII reports the same typed error for a malformed model', () => {
    expect(() => buildXRechnungCII(undefined as unknown as Invoice)).toThrow();
  });
});

describe('prices may have more decimals than the currency (BT-146), exactly', () => {
  it('formats and parses sub-cent prices without floats', () => {
    expect(priceToMajor(1999)).toBe('19.99');
    expect(priceToMajor(1.25)).toBe('0.0125');
    expect(priceToMajor(0.1)).toBe('0.001');
    expect(priceFromMajor('0.0125')).toBe(1.25);
    expect(priceFromMajor('19.99')).toBe(1999);
  });
  it('applies the price base quantity and line allowances/charges to BT-131', () => {
    expect(lineNet({ quantity: 250, unitPriceMinor: 99.5, priceBaseQuantity: 100 })).toBe(249); // 250 x 0.995 / 100 = 2.4875 -> 2.49
    expect(lineNet({ quantity: 2.5, unitPriceMinor: 12000, allowances: [{ amountMinor: 1500 }], charges: [{ amountMinor: 500 }] })).toBe(29000);
    const inv = { ...ok, lines: [{ ...ok.lines[0]!, quantity: 1000, unitPriceMinor: 1.25 }] };
    expect(totals(inv).lineTotal).toBe(1250);
    expect(buildCII(inv)).toContain('<ram:ChargeAmount>0.0125</ram:ChargeAmount>');
  });
});

describe('checkInvoice(): mistakes the Schematron would reject later', () => {
  it('warns about category S with a 0% rate (BR-S-05)', () => {
    const inv = { ...ok, lines: [{ ...ok.lines[0]!, taxCategory: 'S' as const, taxRate: 0 }] };
    expect(checkInvoice(inv).find((i) => i.path === 'lines[0].taxRate')).toMatchObject({ severity: 'warning', bt: 'BT-152' });
  });
});
