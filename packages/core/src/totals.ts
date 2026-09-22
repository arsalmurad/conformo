import { mulRound } from './money.js';
import type { AllowanceCharge, Invoice, Line, TaxCategory, TaxGroup, Totals } from './model.js';

/** BT-131 line net amount: quantity x unit price, rounded half up, exactly. */
export const lineNet = (line: Pick<Line, 'quantity' | 'unitPriceMinor'>): number =>
  mulRound(line.quantity, line.unitPriceMinor);

/** Category O carries no rate (BR-O-05), so its groups are keyed and computed at 0. */
const effectiveRate = (category: TaxCategory, rate: number): number => (category === 'O' ? 0 : rate);

/**
 * The breakdown key is category + rate + exemption. Two lines that are both category E
 * at 0% but cite different exemption reasons need two BG-23 entries, because each
 * entry carries exactly one BT-120 / BT-121.
 */
const groupKey = (c: TaxCategory, rate: number, code?: string, reason?: string): string =>
  `${c}|${rate}|${code ?? ''}|${reason ?? ''}`;

/**
 * BG-23, plus the BT-106/107/108 sums. A document level allowance or charge is
 * attributed to a VAT category (BT-95/BT-102) and moves that breakdown's taxable
 * amount (BR-CO-13, BR-S-08). Without that, BT-109 and the sum of BT-116 disagree.
 */
export function aggregateTax(invoice: Invoice): {
  groups: TaxGroup[]; lineTotal: number; allowance: number; charge: number; taxTotal: number;
} {
  const groups = new Map<string, TaxGroup>();
  const open = (c: TaxCategory, rate: number, code?: string, reason?: string): TaxGroup => {
    const k = groupKey(c, rate, code, reason);
    let g = groups.get(k);
    if (!g) {
      g = { category: c, rate, basis: 0, amount: 0, exemptionReason: reason, exemptionCode: code };
      groups.set(k, g);
    }
    return g;
  };

  let lineTotal = 0;
  for (const line of invoice.lines) {
    const net = lineNet(line);
    lineTotal += net;
    open(line.taxCategory, effectiveRate(line.taxCategory, line.taxRate),
      line.exemptionCode, line.exemptionReason).basis += net;
  }

  // Find the breakdown an allowance/charge belongs to. If it names an exemption it
  // must match one exactly; otherwise it must match exactly one by category and rate.
  const target = (ac: AllowanceCharge): TaxGroup => {
    const rate = effectiveRate(ac.taxCategory, ac.taxRate);
    if (ac.exemptionCode !== undefined || ac.exemptionReason !== undefined) {
      return open(ac.taxCategory, rate, ac.exemptionCode, ac.exemptionReason);
    }
    const hits = [...groups.values()].filter((g) => g.category === ac.taxCategory && g.rate === rate);
    if (hits.length > 1) {
      throw new Error(
        `allowance/charge for VAT category ${ac.taxCategory} at ${rate}% is ambiguous: ` +
        `${hits.length} breakdowns share it. Set exemptionCode or exemptionReason to choose one.`);
    }
    return hits[0] ?? open(ac.taxCategory, rate);
  };

  let allowance = 0;
  for (const a of invoice.allowances ?? []) { allowance += a.amountMinor; target(a).basis -= a.amountMinor; }
  let charge = 0;
  for (const c of invoice.charges ?? []) { charge += c.amountMinor; target(c).basis += c.amountMinor; }

  let taxTotal = 0;
  const list = [...groups.values()];
  for (const g of list) {
    g.amount = mulRound(g.basis, g.rate, 100);
    taxTotal += g.amount;
  }
  return { groups: list, lineTotal, allowance, charge, taxTotal };
}

export function totals(invoice: Invoice): Totals {
  const { groups, lineTotal, allowance, charge, taxTotal } = aggregateTax(invoice);
  const taxBasis = lineTotal - allowance + charge;
  const grand = taxBasis + taxTotal;
  const prepaid = invoice.prepaidMinor ?? 0;
  const rounding = invoice.roundingMinor ?? 0;
  return { groups, lineTotal, allowance, charge, taxBasis, taxTotal, grand, prepaid, rounding,
    due: grand - prepaid + rounding };
}
