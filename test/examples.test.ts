import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { validate, parse, FORMAT_IDS } from '@conformo/toolkit';
import { fromMajor } from '@conformo/core';
import { handleInvoiceFinalized } from '../examples/stripe-to-zugferd/handler.ts';
import type { StripeEvent } from '../examples/stripe-to-zugferd/handler.ts';
import { convertOrder } from '../examples/shopify-to-xrechnung/convert.ts';
import type { ShopifyOrder } from '../examples/shopify-to-xrechnung/convert.ts';
import { app } from '../examples/hono-endpoint/app.ts';
import { runAgentLoop } from '../examples/agent-mcp/client.ts';

const root = process.cwd();
const load = <T,>(...p: string[]): T => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf8')) as T;
const errors = (r: { results: { severity: string; ruleId: string; message: string }[] }): string[] =>
  r.results.filter((x) => x.severity === 'error' || x.severity === 'fatal').map((x) => `${x.ruleId}: ${x.message}`);

describe('example: stripe-to-zugferd', () => {
  it('private buyer: en16931 PDF validates and the total equals Stripe\'s', async () => {
    const event = load<StripeEvent>('examples', 'stripe-to-zugferd', 'invoice-finalized.json');
    const r = await handleInvoiceFinalized(event);
    expect(r.profile).toBe('en16931');
    expect(errors(r.validation)).toEqual([]);
    expect(r.validation.valid).toBe(true);
    expect(r.validation.origin).toBe('pdf');
    const back = await parse(r.pdf);
    expect(back.invoice.number).toBe(event.data.object.number);
    expect(back.totalsCheck.matches).toBe(true);
    expect(back.visibleTotals).toBeTruthy();
    // grand total: recompute independently from the fixture's own numbers
    const { subtotal, total_tax_amounts, total } = event.data.object;
    expect(subtotal + total_tax_amounts[0]!.amount).toBe(total);
    expect(r.xml).toContain('589.05');
  }, 60_000);

  it('German public buyer with a Leitweg-ID: xrechnung profile validates', async () => {
    const event = load<StripeEvent>('examples', 'stripe-to-zugferd', 'invoice-finalized-public-sector.json');
    const r = await handleInvoiceFinalized(event);
    expect(r.profile).toBe('xrechnung');
    expect(errors(r.validation)).toEqual([]);
    expect(r.validation.valid).toBe(true);
    expect(r.xml).toContain('1428.00');
  }, 60_000);

  it('refuses when totals do not match, instead of issuing a different document', async () => {
    const event = load<StripeEvent>('examples', 'stripe-to-zugferd', 'invoice-finalized.json');
    event.data.object.total += 1;
    await expect(handleInvoiceFinalized(event)).rejects.toThrow(/totals differ/);
    await expect(handleInvoiceFinalized({ ...event, type: 'invoice.paid' })).rejects.toThrow(/unexpected event/);
  });
});

describe('example: shopify-to-xrechnung', () => {
  it('order -> XRechnung UBL validates and the total equals total_price', async () => {
    const order = load<ShopifyOrder>('examples', 'shopify-to-xrechnung', 'order.json');
    const r = await convertOrder(order);
    expect(errors(r.validation)).toEqual([]);
    expect(r.validation.valid).toBe(true);
    expect(r.validation.detected.profile).toBe('xrechnung');
    const back = await parse(r.xml);
    expect(back.totalsCheck.matches).toBe(true);
    expect(r.xml).toContain(`<cbc:PayableAmount currencyID="EUR">${order.total_price}</cbc:PayableAmount>`);
    expect(r.invoice.lines.map((l) => l.unitPriceMinor)).toEqual([8990, 3995]);
    expect(fromMajor(order.total_price)).toBe(26150);
  }, 60_000);

  it('does not use floats for money: 0.1+0.2 style prices stay exact', async () => {
    const order = load<ShopifyOrder>('examples', 'shopify-to-xrechnung', 'order.json');
    order.line_items = [{ title: 'Odd price', quantity: 3, price: '0.29', tax_lines: [{ rate: 0.07, price: '0.06' }] }];
    order.total_price = '0.93';
    const r = await convertOrder(order);
    expect(r.invoice.lines[0]).toMatchObject({ unitPriceMinor: 29, taxRate: 7 });
    expect(r.validation.valid).toBe(true);
  }, 60_000);

  it('throws when the order total does not equal the mapped lines (e.g. shipping)', async () => {
    const order = load<ShopifyOrder>('examples', 'shopify-to-xrechnung', 'order.json');
    order.total_price = '271.50';
    await expect(convertOrder(order)).rejects.toThrow(/totals differ/);
    await expect(convertOrder({ ...order, taxes_included: true })).rejects.toThrow(/tax-inclusive/);
  });
});

describe('example: hono-endpoint', () => {
  const invoice = load<Record<string, unknown>>('fixtures', 'xrechnung-public-sector.json');
  const post = (body: unknown): Promise<Response> => Promise.resolve(app.request('/invoice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

  it('creates and validates', async () => {
    const r = await post({ invoice });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { xml: string; valid: boolean; ruleSets: string[] };
    expect(j.valid).toBe(true);
    expect(j.ruleSets.length).toBeGreaterThan(0);
    expect((await validate(j.xml)).valid).toBe(true);
  }, 30_000); // two full Schematron validations: ~4s under the full parallel suite, close to vitest's 5s default

  it('rejects bad input without a stack trace', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ invoice, format: 'fatturapa' })).status).toBe(400);
    const r = await post({ invoice: { ...invoice, lines: [] } });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toBe('invalid_invoice');
    expect(FORMAT_IDS).not.toContain('fatturapa');
  });
});

describe('example: agent-mcp', () => {
  it('spawns the MCP server, lists tools, creates and validates', async () => {
    const r = await runAgentLoop();
    expect(r.tools).toEqual(expect.arrayContaining(['create_invoice', 'validate_invoice', 'parse_invoice']));
    expect(r.valid).toBe(true);
    expect(r.ruleSets.length).toBeGreaterThan(0);
    expect(r.summary).toMatch(/^VALID/);
    expect((await validate(r.xml)).valid).toBe(true);
    expect(r.xml).toContain('<cbc:PayableAmount currencyID="EUR">1190.00</cbc:PayableAmount>');
  }, 120_000);
});
