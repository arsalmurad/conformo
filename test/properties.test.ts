import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { checkInvoice, decimalToString, fromMajor, lineNet, mulRound, priceFromMajor, priceToMajor, toMajor, totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { buildCII, buildUBL } from '@conformo/formats';
import { detectXmlFormat, parseXml, readInvoiceFromPdf } from '@conformo/parse';
import { validate } from '@conformo/validate';

// Exact reference arithmetic with BigInt, independent of the implementation under test.
const refMul = (qtyInt: bigint, qtyScale: number, priceInt: bigint, priceScale: number): bigint => {
  const num = qtyInt * priceInt;
  const den = 10n ** BigInt(qtyScale + priceScale);
  const neg = num < 0n;
  const n = neg ? -num : num;
  const q = (2n * n + den) / (2n * den);   // round half away from zero
  return neg ? -q : q;
};

describe('money (properties)', () => {
  it('mulRound equals exact BigInt arithmetic for any decimal quantity and price', () => {
    fc.assert(fc.property(
      fc.integer({ min: -9_999_999, max: 9_999_999 }), fc.integer({ min: 0, max: 6 }),
      fc.integer({ min: -9_999_999, max: 9_999_999 }), fc.integer({ min: 0, max: 4 }),
      (qi, qs, pi, ps) => {
        const q = decimalToString(`${qi}e${-qs}`);
        const p = decimalToString(`${pi}e${-ps}`);
        expect(mulRound(q, p)).toBe(Number(refMul(BigInt(qi), qs, BigInt(pi), ps)));
      }), { numRuns: 500 });
  });
  it('toMajor / fromMajor round-trip for every safe integer amount', () => {
    fc.assert(fc.property(fc.integer({ min: -1e12, max: 1e12 }), (n) => fromMajor(toMajor(n)) === n));
  });
  it('priceToMajor / priceFromMajor round-trip for prices with up to 6 extra decimals', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1e9 }), fc.integer({ min: 0, max: 6 }), (n, d) => {
      const price = Number(decimalToString(`${n}e${-d}`));
      return priceFromMajor(priceToMajor(price)) === price;
    }));
  });
  it('never emits an exponent or a float artefact', () => {
    fc.assert(fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (x) => !/e/i.test(decimalToString(x))));
  });
});

const lineArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ''),
  quantity: fc.integer({ min: 1, max: 100000 }).map((n) => n / 1000),
  unitPriceMinor: fc.integer({ min: 0, max: 5_000_000 }),
  taxCategory: fc.constant('S' as const),
  taxRate: fc.constantFrom(7, 19, 20),   // category S needs a rate above 0 (BR-S-05); checkInvoice warns otherwise
});
const invoiceArb = fc.record({ lines: fc.array(lineArb, { minLength: 1, maxLength: 8 }) }).map(({ lines }): Invoice => ({
  number: 'P-1', issueDate: '2027-03-01', currency: 'EUR',
  seller: { name: 'S GmbH', vatId: 'DE123456789', country: 'DE' }, buyer: { name: 'B GmbH', country: 'DE' },
  payment: { meansCode: '58', iban: 'DE89370400440532013000' }, lines,
}));

describe('totals (properties)', () => {
  it('the totals are internally consistent for any invoice', () => {
    fc.assert(fc.property(invoiceArb, (inv) => {
      const t = totals(inv);
      expect(t.lineTotal).toBe(inv.lines.reduce((s, l) => s + lineNet(l), 0));        // BR-CO-10
      expect(t.taxBasis).toBe(t.lineTotal - t.allowance + t.charge);                    // BR-CO-13
      expect(t.groups.reduce((s, g) => s + g.amount, 0)).toBe(t.taxTotal);             // BR-CO-14
      expect(t.grand).toBe(t.taxBasis + t.taxTotal);                                    // BR-CO-15
      expect(t.due).toBe(t.grand - t.prepaid + t.rounding);                             // BR-CO-16
    }), { numRuns: 300 });
  });
  it('does not depend on the order of the lines', () => {
    fc.assert(fc.property(invoiceArb, (inv) => {
      const reversed = { ...inv, lines: [...inv.lines].reverse() };
      const norm = (x: ReturnType<typeof totals>) => ({ ...x, groups: [...x.groups].sort((a, b) => a.rate - b.rate) });   // group order is not meaningful
      expect(norm(totals(reversed))).toEqual(norm(totals(inv)));
    }), { numRuns: 200 });
  });
  it('checkInvoice finds no error in any generated invoice', () => {
    fc.assert(fc.property(invoiceArb, (inv) => checkInvoice(inv).every((i) => i.severity !== 'error')), { numRuns: 200 });
  });
});

describe('round trip and validity (properties)', () => {
  it('any generated invoice is written as valid CII and UBL and read back to the same totals', async () => {
    await fc.assert(fc.asyncProperty(invoiceArb, async (inv) => {
      for (const xml of [buildCII(inv), buildUBL(inv)]) {
        const r = await validate(xml);
        expect(r.valid, JSON.stringify(r.results.filter((x) => x.severity === 'error' || x.severity === 'fatal').slice(0, 2))).toBe(true);
        expect(totals(detectXmlFormat(xml).invoice).grand).toBe(totals(inv).grand);
      }
    }), { numRuns: 12 });
  }, 120000);
});

describe('parsers on hostile input (fuzz)', () => {
  const typed = (e: unknown) => e instanceof Error && /^(Xml|Unrecognized|NoEmbedded|Invalid|Range|Type)/.test(e.name + (e as Error).constructor.name) || e instanceof Error;
  it('the XML parser never hangs or crashes on arbitrary text, and always throws an Error subclass', () => {
    fc.assert(fc.property(fc.string({ maxLength: 400 }), (s) => {
      try { parseXml(s); } catch (e) { expect(typed(e)).toBe(true); }
    }), { numRuns: 1000 });
  });
  it('mutated valid documents are rejected or parsed, never crash with a TypeError', () => {
    const base = buildCII({ number: 'F-1', issueDate: '2027-01-01', currency: 'EUR', seller: { name: 'S', country: 'DE' }, buyer: { name: 'B', country: 'DE' },
      lines: [{ name: 'x', quantity: 1, unitPriceMinor: 100, taxCategory: 'S', taxRate: 19 }] });
    fc.assert(fc.property(fc.nat({ max: base.length - 1 }), fc.nat({ max: 40 }), (at, cut) => {
      const broken = base.slice(0, at) + base.slice(at + cut);
      try { detectXmlFormat(broken); } catch (e) { expect(e).toBeInstanceOf(Error); expect((e as Error).name).not.toBe('TypeError'); }
    }), { numRuns: 300 });
  });
  // Counterexamples the fuzz test above found (seed 581969183: a CII line price with its ChargeAmount cut out). A required
  // value element that is absent reached .trim() on undefined. Pinned here so they run every time, not by chance.
  describe('a missing required value element is a RangeError, not a TypeError', () => {
    const inv: Invoice = { number: 'F-1', issueDate: '2027-01-01', currency: 'EUR', seller: { name: 'S', country: 'DE' }, buyer: { name: 'B', country: 'DE' },
      lines: [{ name: 'x', quantity: 1, unitPriceMinor: 100, taxCategory: 'S', taxRate: 19 }],
      allowances: [{ amountMinor: 10, taxCategory: 'S', taxRate: 19, reason: 'Discount' }] };
    const cases: [string, string, RegExp][] = [
      ['CII line net price (BT-146)', buildCII(inv), /<ram:ChargeAmount>1<\/ram:ChargeAmount>/],
      ['CII document allowance amount (BT-92)', buildCII(inv), /<ram:ActualAmount>[^<]*<\/ram:ActualAmount>/],
      ['UBL line net price (BT-146)', buildUBL(inv), /<cbc:PriceAmount currencyID="EUR">1<\/cbc:PriceAmount>/],
      ['UBL document allowance amount (BT-92)', buildUBL(inv), /(<cac:AllowanceCharge>.*?)<cbc:Amount currencyID="EUR">[^<]*<\/cbc:Amount>/],
    ];
    for (const [label, xml, element] of cases) {
      it(label, () => {
        const broken = xml.replace(element, '$1');
        expect(broken).not.toBe(xml);
        expect(() => detectXmlFormat(broken)).toThrow(RangeError);
      });
    }
  });
  it('enforces its depth and size limits', () => {
    expect(() => parseXml('<a>'.repeat(500) + '</a>'.repeat(500))).toThrow();
    expect(() => parseXml('<a>' + 'x'.repeat(2000) + '</a>', { maxBytes: 100 })).toThrow();
    expect(() => parseXml('<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>')).toThrow();
  });
  it('the PDF reader rejects random bytes with an Error, not a crash or a hang', async () => {
    await fc.assert(fc.asyncProperty(fc.uint8Array({ maxLength: 600 }), async (bytes) => {
      await expect(readInvoiceFromPdf(bytes)).rejects.toBeInstanceOf(Error);
    }), { numRuns: 60 });
  }, 60000);
});
