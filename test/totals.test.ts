import { describe, it, expect } from 'vitest';
import { totals } from '@verinvoice/core';
import type { AllowanceCharge, Invoice, TaxCategory } from '@verinvoice/core';

const base = (lines: Invoice['lines'], extra: Partial<Invoice> = {}): Invoice => ({
  number: 'T-1', issueDate: '2026-01-01', currency: 'EUR',
  seller: { name: 'S', street: 's', city: 'c', postcode: '1', country: 'FR' },
  buyer: { name: 'B', street: 's', city: 'c', postcode: '1', country: 'DE' },
  payment: { meansCode: '58' }, lines, ...extra,
});

const line = (unitPriceMinor: number, taxRate = 20, taxCategory: TaxCategory = 'S', quantity = 1) =>
  ({ name: 'x', quantity, unitPriceMinor, taxCategory, taxRate });

const sumBasis = (t: ReturnType<typeof totals>) => t.groups.reduce((s, g) => s + g.basis, 0);

// Deterministic PRNG so a failure here is reproducible, not a one-in-a-thousand ghost.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('EN 16931 total reconciliation (BR-CO-* invariants)', () => {
  it('BR-CO-10: line total equals the sum of line net amounts', () => {
    const t = totals(base([line(1000, 20, 'S', 3), line(550)]));
    expect(t.lineTotal).toBe(3550);
  });

  it('BR-CO-13: tax basis = line total - allowances + charges', () => {
    const t = totals(base([line(10000)], {
      allowances: [{ amountMinor: 1000, taxCategory: 'S', taxRate: 20 }],
      charges: [{ amountMinor: 500, taxCategory: 'S', taxRate: 20 }],
    }));
    expect(t.allowance).toBe(1000);
    expect(t.charge).toBe(500);
    expect(t.taxBasis).toBe(10000 - 1000 + 500);
  });

  it('a document allowance reduces the VAT breakdown it is attributed to (regression)', () => {
    // Before BG-20 existed the allowance moved BT-109 but not BT-116, so the breakdown
    // summed to 10000 while BT-109 said 9000, and tax was charged on the undiscounted amount.
    const t = totals(base([line(10000)], {
      allowances: [{ amountMinor: 1000, taxCategory: 'S', taxRate: 20, reason: 'Loyalty' }],
    }));
    expect(t.taxBasis).toBe(9000);
    expect(sumBasis(t)).toBe(9000);
    expect(t.taxTotal).toBe(1800);
    expect(t.grand).toBe(10800);
  });

  it('attributes an allowance and a charge to different VAT categories independently', () => {
    const t = totals(base([line(10000, 20), line(5000, 5.5)], {
      allowances: [{ amountMinor: 2000, taxCategory: 'S', taxRate: 20 }],
      charges: [{ amountMinor: 1000, taxCategory: 'S', taxRate: 5.5 }],
    }));
    expect(t.groups.find((g) => g.rate === 20)!.basis).toBe(8000);
    expect(t.groups.find((g) => g.rate === 5.5)!.basis).toBe(6000);
    expect(sumBasis(t)).toBe(t.taxBasis);
  });

  it('creates a breakdown for a charge whose category no line uses (BR-S-01 style)', () => {
    const t = totals(base([line(10000, 20)], {
      charges: [{ amountMinor: 700, taxCategory: 'Z', taxRate: 0 }],
    }));
    expect(t.groups).toHaveLength(2);
    expect(t.groups.find((g) => g.category === 'Z')!.basis).toBe(700);
    expect(sumBasis(t)).toBe(t.taxBasis);
  });

  it('refuses to guess when an allowance matches several breakdowns', () => {
    const inv = base([
      { ...line(1000, 0, 'E'), exemptionReason: 'Art. 132 A' },
      { ...line(1000, 0, 'E'), exemptionReason: 'Art. 132 B' },
    ], { allowances: [{ amountMinor: 100, taxCategory: 'E', taxRate: 0 }] });
    expect(() => totals(inv)).toThrow(/ambiguous/);
  });

  it('lets an exemption reason pick the breakdown an allowance belongs to', () => {
    const t = totals(base([
      { ...line(1000, 0, 'E'), exemptionReason: 'Art. 132 A' },
      { ...line(1000, 0, 'E'), exemptionReason: 'Art. 132 B' },
    ], { allowances: [{ amountMinor: 100, taxCategory: 'E', taxRate: 0, exemptionReason: 'Art. 132 B' }] }));
    expect(t.groups.find((g) => g.exemptionReason === 'Art. 132 A')!.basis).toBe(1000);
    expect(t.groups.find((g) => g.exemptionReason === 'Art. 132 B')!.basis).toBe(900);
  });

  it('BR-CO-15: grand total = tax basis + tax total', () => {
    const t = totals(base([line(10000)]));
    expect(t.grand).toBe(t.taxBasis + t.taxTotal);
  });

  it('BR-CO-16: amount due = grand total - prepaid + rounding', () => {
    const t = totals(base([line(10000)], { prepaidMinor: 2500, roundingMinor: -3 }));
    expect(t.due).toBe(t.grand - 2500 - 3);
    expect(t.rounding).toBe(-3);
  });

  it('groups VAT by category and rate, one breakdown entry each', () => {
    const t = totals(base([line(10000), line(5000), line(5000, 5.5), line(3000, 0, 'Z')]));
    expect(t.groups).toHaveLength(3);
    expect(t.groups.find((g) => g.rate === 20)!.basis).toBe(15000);
    expect(t.groups.find((g) => g.rate === 0)!.amount).toBe(0);
  });

  it('keeps one breakdown per exemption reason instead of silently dropping the second (regression)', () => {
    const t = totals(base([
      { ...line(1000, 0, 'E'), exemptionReason: 'Reason A', exemptionCode: 'VATEX-EU-132' },
      { ...line(2000, 0, 'E'), exemptionReason: 'Reason B', exemptionCode: 'VATEX-EU-143' },
    ]));
    expect(t.groups).toHaveLength(2);
    expect(t.groups.map((g) => g.exemptionCode).sort()).toEqual(['VATEX-EU-132', 'VATEX-EU-143']);
  });

  it('category O is computed at 0% whatever rate was supplied (BR-O-05)', () => {
    const t = totals(base([line(10000, 20, 'O')]));
    expect(t.groups[0]!.rate).toBe(0);
    expect(t.taxTotal).toBe(0);
    expect(t.grand).toBe(10000);
  });

  it('holds the invariants across 1000 seeded random invoices, allowances and charges included', () => {
    const rand = mulberry32(20260920);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
    const rates = [0, 5.5, 7, 10, 19, 19.6, 20, 21, 23];
    for (let i = 0; i < 1000; i++) {
      const lines: Invoice['lines'] = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => ({
        name: 'x',
        quantity: pick([1, 2, 3, 0.5, 1.25, 0.009, 12.75, 100]),
        unitPriceMinor: 1 + Math.floor(rand() * 500000),
        taxCategory: 'S' as const,
        taxRate: pick(rates),
      }));
      // Attribute each document allowance/charge to a rate that some line uses, so they merge.
      const ac = (): AllowanceCharge => {
        const l = pick(lines);
        return { amountMinor: 1 + Math.floor(rand() * 5000), taxCategory: 'S', taxRate: l.taxRate };
      };
      const t = totals(base(lines, {
        allowances: rand() < 0.5 ? [ac(), ac()] : [],
        charges: rand() < 0.5 ? [ac()] : [],
        prepaidMinor: Math.floor(rand() * 10000),
      }));
      expect(Number.isInteger(t.grand)).toBe(true);
      expect(t.taxBasis).toBe(t.lineTotal - t.allowance + t.charge);
      expect(sumBasis(t)).toBe(t.taxBasis);                 // BR-CO-13 vs the breakdown
      expect(t.grand).toBe(t.taxBasis + t.taxTotal);        // BR-CO-15
      expect(t.due).toBe(t.grand - t.prepaid + t.rounding); // BR-CO-16
      expect(t.taxTotal).toBe(t.groups.reduce((s, g) => s + g.amount, 0)); // BR-CO-14
    }
  });
});
