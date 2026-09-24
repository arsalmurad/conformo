/**
 * A flat, one-row-per-invoice CSV: the shape a spreadsheet or a basic
 * bookkeeping import expects, not a full invoice representation (that's what
 * the XML formats and the JSON export are for). Amounts are decimal text via
 * toMajor(), the same conversion the XML serializers use, because a CSV is
 * for humans and other tools to read, not for this codebase's own money math.
 */
import { totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { toMajor } from '@conformo/core';

const COLUMNS = [
  'number', 'typeCode', 'issueDate', 'dueDate', 'currency',
  'sellerName', 'sellerVatId', 'buyerName', 'buyerVatId',
  'lineTotal', 'allowanceTotal', 'chargeTotal', 'taxTotal', 'grandTotal', 'prepaid', 'due',
] as const;

/** RFC 4180: a field is quoted only when it needs to be, and an embedded
 * quote is doubled. Never quoting unconditionally would still be valid CSV,
 * but this keeps typical exports (currency codes, numbers, dates) readable. */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function row(invoice: Invoice): string {
  const t = totals(invoice);
  const values: Record<(typeof COLUMNS)[number], string> = {
    number: invoice.number,
    typeCode: invoice.typeCode ?? '380',
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate ?? '',
    currency: invoice.currency,
    sellerName: invoice.seller.name,
    sellerVatId: invoice.seller.vatId ?? '',
    buyerName: invoice.buyer.name,
    buyerVatId: invoice.buyer.vatId ?? '',
    lineTotal: toMajor(t.lineTotal),
    allowanceTotal: toMajor(t.allowance),
    chargeTotal: toMajor(t.charge),
    taxTotal: toMajor(t.taxTotal),
    grandTotal: toMajor(t.grand),
    prepaid: toMajor(t.prepaid),
    due: toMajor(t.due),
  };
  return COLUMNS.map((c) => csvField(values[c])).join(',');
}

/** CRLF line endings, per RFC 4180 — the format most spreadsheet/accounting
 * importers expect, even though every producer and reader in this repo
 * otherwise treats \n as the line ending. */
export function exportInvoicesToCsv(invoices: Invoice[]): string {
  return [COLUMNS.join(','), ...invoices.map(row)].join('\r\n') + '\r\n';
}
