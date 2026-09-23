import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import type { Invoice } from '@invoice-engine/core';
import { exportInvoicesToAccountingJson, exportInvoicesToCsv } from '../packages/parse/src/index.js';

const invoice = JSON.parse(fs.readFileSync('fixtures/sample-invoice.json', 'utf8')) as Invoice;
const multiRate = JSON.parse(fs.readFileSync('fixtures/multi-rate-allowances.json', 'utf8')) as Invoice;

describe('exportInvoicesToCsv()', () => {
  it('writes a header row and one row per invoice with decimal, human-readable amounts', () => {
    const csv = exportInvoicesToCsv([invoice]);
    const [header, row] = csv.trim().split('\r\n');
    expect(header).toBe(
      'number,typeCode,issueDate,dueDate,currency,sellerName,sellerVatId,buyerName,buyerVatId,' +
      'lineTotal,allowanceTotal,chargeTotal,taxTotal,grandTotal,prepaid,due',
    );
    expect(row).toContain('INV-2026-0001');
    expect(row).toContain('5428.00'); // amount due, after the 2000.00 prepayment
  });

  it('quotes a field containing a comma, per RFC 4180', () => {
    const withComma: Invoice = { ...invoice, seller: { ...invoice.seller, name: 'Doe, Jane' } };
    const csv = exportInvoicesToCsv([withComma]);
    expect(csv).toContain('"Doe, Jane"');
  });

  it('handles multiple invoices, one row each', () => {
    const csv = exportInvoicesToCsv([invoice, multiRate]);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3); // header + 2 rows
  });
});

describe('exportInvoicesToAccountingJson()', () => {
  it('produces integer-minor-unit totals matching packages/core/src/totals.ts', () => {
    const json = JSON.parse(exportInvoicesToAccountingJson([invoice]));
    expect(json).toHaveLength(1);
    const rec = json[0];
    expect(rec.number).toBe('INV-2026-0001');
    expect(rec.grandTotalMinor).toBe(742800);
    expect(rec.dueMinor).toBe(542800);
    expect(Number.isInteger(rec.grandTotalMinor)).toBe(true);
  });

  it('includes one tax-breakdown line per VAT category/rate group', () => {
    const json = JSON.parse(exportInvoicesToAccountingJson([multiRate]));
    const rec = json[0];
    // Three lines at three different rates (20%, 10%, 5.5%), reduced by two
    // allowances at 20% and 5.5% and a charge at 20%.
    expect(rec.taxBreakdown).toHaveLength(3);
    const rates = rec.taxBreakdown.map((g: { rate: number }) => g.rate).sort((a: number, b: number) => a - b);
    expect(rates).toEqual([5.5, 10, 20]);
  });
});
