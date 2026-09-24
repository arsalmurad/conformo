/**
 * A simple accounting-export JSON: one record per invoice with the totals a
 * basic bookkeeping system posts (line total, VAT breakdown, grand total,
 * amount due), computed the same way the PDF and the XML formats compute
 * them (packages/core/src/totals.ts) so this can never disagree with either.
 * This is a data bridge, not a ledger: the project's anti-goals rule out this
 * project ever becoming an accounting system, and this export doesn't decide
 * how a receiving system books the entry — it just states the facts.
 * Amounts are Minor (integer cents), unlike the CSV export, because this is
 * for another program to read, not a human — no float ever decides a cent
 * (packages/core/src/money.ts) is a promise this format keeps too.
 */
import { totals } from '@verinvoice/core';
import type { Invoice, Minor, TaxCategory } from '@verinvoice/core';

export interface AccountingTaxLine {
  category: TaxCategory;
  rate: number;
  basisMinor: Minor;
  amountMinor: Minor;
  exemptionCode?: string;
  exemptionReason?: string;
}

export interface AccountingRecord {
  number: string;
  typeCode: string;
  issueDate: string;
  dueDate?: string;
  currency: string;
  seller: { name: string; vatId?: string; country: string };
  buyer: { name: string; vatId?: string; country: string };
  lineTotalMinor: Minor;
  allowanceTotalMinor: Minor;
  chargeTotalMinor: Minor;
  taxBasisMinor: Minor;
  taxTotalMinor: Minor;
  grandTotalMinor: Minor;
  prepaidMinor: Minor;
  roundingMinor: Minor;
  dueMinor: Minor;
  taxBreakdown: AccountingTaxLine[];
}

export function toAccountingRecord(invoice: Invoice): AccountingRecord {
  const t = totals(invoice);
  return {
    number: invoice.number,
    typeCode: invoice.typeCode ?? '380',
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    seller: { name: invoice.seller.name, vatId: invoice.seller.vatId, country: invoice.seller.country },
    buyer: { name: invoice.buyer.name, vatId: invoice.buyer.vatId, country: invoice.buyer.country },
    lineTotalMinor: t.lineTotal,
    allowanceTotalMinor: t.allowance,
    chargeTotalMinor: t.charge,
    taxBasisMinor: t.taxBasis,
    taxTotalMinor: t.taxTotal,
    grandTotalMinor: t.grand,
    prepaidMinor: t.prepaid,
    roundingMinor: t.rounding,
    dueMinor: t.due,
    taxBreakdown: t.groups.map((g) => ({
      category: g.category, rate: g.rate, basisMinor: g.basis, amountMinor: g.amount,
      exemptionCode: g.exemptionCode, exemptionReason: g.exemptionReason,
    })),
  };
}

export function exportInvoicesToAccountingJson(invoices: Invoice[]): string {
  return JSON.stringify(invoices.map(toAccountingRecord), null, 2);
}
