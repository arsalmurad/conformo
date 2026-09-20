import { roundHalfUp } from './money.js';
import type { Invoice, TaxGroup, Totals } from './model.js';

/** Group lines by (category, rate). One VAT breakdown entry per group: BG-23. */
export function aggregateTax(invoice: Invoice): { groups: TaxGroup[]; lineTotal: number; taxTotal: number } {
  const groups = new Map<string, TaxGroup>();
  for (const line of invoice.lines) {
    const net = roundHalfUp(line.quantity * line.unitPriceMinor);
    const key = `${line.taxCategory}|${line.taxRate}`;
    const g = groups.get(key) ?? {
      category: line.taxCategory, rate: line.taxRate, basis: 0, amount: 0,
      exemptionReason: line.exemptionReason, exemptionCode: line.exemptionCode,
    };
    g.basis += net;
    groups.set(key, g);
  }
  let taxTotal = 0;
  for (const g of groups.values()) {
    g.amount = roundHalfUp((g.basis * g.rate) / 100);
    taxTotal += g.amount;
  }
  const list = [...groups.values()];
  return { groups: list, lineTotal: list.reduce((s, g) => s + g.basis, 0), taxTotal };
}

export function totals(invoice: Invoice): Totals {
  const { groups, lineTotal, taxTotal } = aggregateTax(invoice);
  const allowance = invoice.allowanceTotalMinor ?? 0;
  const charge = invoice.chargeTotalMinor ?? 0;
  const taxBasis = lineTotal - allowance + charge;
  const grand = taxBasis + taxTotal;
  const prepaid = invoice.prepaidMinor ?? 0;
  return { groups, lineTotal, allowance, charge, taxBasis, taxTotal, grand, prepaid, due: grand - prepaid };
}
