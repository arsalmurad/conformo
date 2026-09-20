import { describe, it, expect } from 'vitest';
import { fromMajor, toMajor, roundHalfUp, totals } from '@invoice-engine/core';
import type { Invoice } from '@invoice-engine/core';

const base = (lines: Invoice['lines'], extra: Partial<Invoice> = {}): Invoice => ({
  number: 'T-1', issueDate: '2026-01-01', currency: 'EUR',
  seller: { name: 'S', street: 's', city: 'c', postcode: '1', country: 'FR' },
  buyer: { name: 'B', street: 's', city: 'c', postcode: '1', country: 'DE' },
  payment: { meansCode: '58' }, lines, ...extra,
});

describe('money', () => {
  it('never uses floats', () => {
    expect(fromMajor(0.1) + fromMajor(0.2)).toBe(30);
    expect(toMajor(fromMajor(0.1) + fromMajor(0.2))).toBe('0.30');
  });
  it('rounds half up preserving sign', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });
});

describe('EN 16931 total reconciliation (BR-CO-* invariants)', () => {
  it('BR-CO-10: line total equals the sum of line net amounts', () => {
    const t = totals(base([
      { name: 'a', quantity: 3, unitPriceMinor: 1000, taxCategory: 'S', taxRate: 20 },
      { name: 'b', quantity: 1, unitPriceMinor: 550, taxCategory: 'S', taxRate: 20 },
    ]));
    expect(t.lineTotal).toBe(3550);
  });

  it('BR-CO-13: tax basis = line total - allowances + charges', () => {
    const t = totals(base(
      [{ name: 'a', quantity: 1, unitPriceMinor: 10000, taxCategory: 'S', taxRate: 20 }],
      { allowanceTotalMinor: 1000, chargeTotalMinor: 500 },
    ));
    expect(t.taxBasis).toBe(10000 - 1000 + 500);
  });

  it('BR-CO-15: grand total = tax basis + tax total', () => {
    const t = totals(base([{ name: 'a', quantity: 1, unitPriceMinor: 10000, taxCategory: 'S', taxRate: 20 }]));
    expect(t.grand).toBe(t.taxBasis + t.taxTotal);
  });

  it('BR-CO-16: amount due = grand total - prepaid', () => {
    const t = totals(base([{ name: 'a', quantity: 1, unitPriceMinor: 10000, taxCategory: 'S', taxRate: 20 }],
      { prepaidMinor: 2500 }));
    expect(t.due).toBe(t.grand - 2500);
  });

  it('groups VAT by category and rate, one breakdown entry each', () => {
    const t = totals(base([
      { name: 'a', quantity: 1, unitPriceMinor: 10000, taxCategory: 'S', taxRate: 20 },
      { name: 'b', quantity: 1, unitPriceMinor: 5000, taxCategory: 'S', taxRate: 20 },
      { name: 'c', quantity: 1, unitPriceMinor: 5000, taxCategory: 'S', taxRate: 5.5 },
      { name: 'd', quantity: 1, unitPriceMinor: 3000, taxCategory: 'Z', taxRate: 0 },
    ]));
    expect(t.groups).toHaveLength(3);
    expect(t.groups.find((g) => g.rate === 20)!.basis).toBe(15000);
    expect(t.groups.find((g) => g.rate === 0)!.amount).toBe(0);
  });

  it('holds the invariants across 500 randomised invoices', () => {
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(Math.random() * 8);
      const lines: Invoice['lines'] = Array.from({ length: n }, () => ({
        name: 'x',
        quantity: 1 + Math.floor(Math.random() * 20),
        unitPriceMinor: 1 + Math.floor(Math.random() * 500000),
        taxCategory: 'S' as const,
        taxRate: [0, 5.5, 7, 10, 19, 20, 21, 23][Math.floor(Math.random() * 8)]!,
      }));
      const t = totals(base(lines, { prepaidMinor: Math.floor(Math.random() * 10000) }));
      expect(Number.isInteger(t.grand)).toBe(true);
      expect(t.taxBasis).toBe(t.lineTotal - t.allowance + t.charge);
      expect(t.grand).toBe(t.taxBasis + t.taxTotal);
      expect(t.due).toBe(t.grand - t.prepaid);
      expect(t.taxTotal).toBe(t.groups.reduce((s, g) => s + g.amount, 0));
    }
  });
});
