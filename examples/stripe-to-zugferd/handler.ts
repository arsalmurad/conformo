/**
 * Stripe `invoice.finalized` (synthetic, simplified shape) -> Factur-X / ZUGFeRD PDF. Run: npx tsx examples/stripe-to-zugferd/handler.ts [fixture.json] [outDir]
 * Exits non-zero when the produced document does not validate.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPdf, validate } from '@conformo/toolkit';
import type { Invoice, ValidatedDocument } from '@conformo/toolkit';
import { totals } from '@conformo/core';

/** The subset of Stripe's invoice object this example reads. Everything else in a real payload is ignored. */
export interface StripeInvoice {
  id: string; number: string; currency: string; created: number; due_date: number | null;
  customer_name: string | null; customer_email: string | null;
  customer_address: { line1?: string | null; line2?: string | null; city?: string | null; postal_code?: string | null; country?: string | null } | null;
  customer_tax_ids?: { type: string; value: string }[];
  metadata?: Record<string, string>;
  lines: { data: { description: string | null; quantity: number | null; price: { unit_amount: number | null }; tax_rates?: { percentage: number }[] }[] };
  total_tax_amounts: { amount: number; tax_rate: { percentage: number } }[];
  subtotal: number;
  total: number;
}
export interface StripeEvent { id: string; type: string; data: { object: StripeInvoice } }

/** The merchant is not part of a Stripe invoice object; it comes from your own configuration. */
export const SELLER: Invoice['seller'] = {
  name: 'Acme Software GmbH', vatId: 'DE123456789', street: 'Hauptstrasse 1', city: 'Berlin', postcode: '10115', country: 'DE',
  electronicAddress: 'billing@acme-software.example', electronicAddressScheme: 'EM',
  contact: { name: 'Billing Team', phone: '+49 30 1234567', email: 'billing@acme-software.example' },
};
const PAYMENT: NonNullable<Invoice['payment']> = { meansCode: '58', iban: 'DE89370400440532013000', accountName: 'Acme Software GmbH' };

const day = (unix: number): string => new Date(unix * 1000).toISOString().slice(0, 10);

/** Stripe amounts are already integers in the currency's smallest unit, which is exactly Conformo's minor unit. */
export function mapStripeInvoice(s: StripeInvoice): Invoice {
  const a = s.customer_address;
  const vat = s.customer_tax_ids?.find((t) => t.type === 'eu_vat')?.value;
  const leitweg = s.metadata?.leitweg_id; // synthetic convention: where this example finds a German public buyer's Leitweg-ID
  if (!s.customer_name) throw new Error('customer_name is required to address the invoice');
  if (!a?.country) throw new Error('customer_address.country is required (BT-55)');
  return {
    number: s.number, issueDate: day(s.created), ...(s.due_date ? { dueDate: day(s.due_date) } : {}), currency: s.currency.toUpperCase(),
    ...(leitweg ? { buyerReference: leitweg } : {}),
    seller: SELLER,
    buyer: {
      name: s.customer_name,
      ...(a?.line1 ? { street: a.line1 } : {}), ...(a?.line2 ? { street2: a.line2 } : {}), ...(a?.city ? { city: a.city } : {}),
      ...(a?.postal_code ? { postcode: a.postal_code } : {}), country: a.country.toUpperCase(),
      ...(vat ? { vatId: vat } : {}),
      ...(s.customer_email ? { electronicAddress: leitweg ?? s.customer_email, electronicAddressScheme: leitweg ? '0204' : 'EM' } : {}),
    },
    payment: PAYMENT,
    lines: s.lines.data.map((l) => {
      const rate = l.tax_rates?.[0]?.percentage;
      if (rate === undefined || rate <= 0) throw new Error('only lines with a positive tax rate are mapped; zero-rated and exempt lines need an explicit VAT category');
      if (l.price.unit_amount === null) throw new Error('metered or tiered prices (no unit_amount) are not mapped');
      return { name: l.description ?? 'Item', quantity: l.quantity ?? 1, unitPriceMinor: l.price.unit_amount, unitCode: 'C62', taxCategory: 'S' as const, taxRate: rate };
    }),
  };
}

export interface HandlerResult { invoice: Invoice; pdf: Uint8Array; xml: string; profile: 'en16931' | 'xrechnung'; validation: ValidatedDocument }

export async function handleInvoiceFinalized(event: StripeEvent): Promise<HandlerResult> {
  if (event.type !== 'invoice.finalized') throw new Error(`unexpected event type ${event.type}`);
  const stripe = event.data.object;
  const invoice = mapStripeInvoice(stripe);
  // Never ship a document whose totals differ from the ones Stripe charged.
  const computed = totals(invoice).grand;
  if (computed !== stripe.total) throw new Error(`totals differ: Stripe says ${stripe.total}, the lines give ${computed} (minor units); discounts, proration and tax-inclusive prices are not mapped`);
  const stated = stripe.total_tax_amounts.reduce((n, t) => n + t.amount, 0);
  if (stated !== totals(invoice).taxTotal) throw new Error(`VAT differs: Stripe says ${stated}, computed ${totals(invoice).taxTotal}`);
  const profile = invoice.buyerReference && invoice.buyer.country === 'DE' ? 'xrechnung' : 'en16931';
  const { pdf, xml } = await createPdf(invoice, { profile });
  return { invoice, pdf, xml, profile, validation: await validate(pdf) };
}

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixture = process.argv[2] ?? path.join(here, 'invoice-finalized.json');
  const outDir = process.argv[3] ?? path.join('out', 'examples', 'stripe-to-zugferd');
  const r = await handleInvoiceFinalized(JSON.parse(readFileSync(fixture, 'utf8')) as StripeEvent);
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${r.invoice.number}.pdf`);
  writeFileSync(file, r.pdf);
  console.log(`${file}: profile ${r.profile}, valid=${r.validation.valid}, rule sets: ${r.validation.ruleSets.map((x) => x.id).join(', ')}`);
  if (!r.validation.valid) {
    for (const f of r.validation.results.filter((x) => x.severity === 'error' || x.severity === 'fatal')) console.error(`${f.ruleId}: ${f.message}`);
    process.exit(1);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
