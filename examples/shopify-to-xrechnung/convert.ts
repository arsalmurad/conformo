/**
 * Shopify order (synthetic, simplified Admin REST shape) -> XRechnung UBL, validated. Run: npx tsx examples/shopify-to-xrechnung/convert.ts [order.json]
 * Exits non-zero when the produced document does not validate.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createXml, validate } from '@conformo/toolkit';
import type { Invoice, ValidatedDocument } from '@conformo/toolkit';
import { fromMajor, totals } from '@conformo/core';

/** The subset of Shopify's order object this example reads. Shipping lines, discounts, refunds, fulfilments etc. are ignored. */
export interface ShopifyOrder {
  name: string; email?: string | null; created_at: string; currency: string; taxes_included: boolean; total_price: string;
  line_items: { title: string; sku?: string | null; quantity: number; price: string; tax_lines: { rate: number; price: string }[] }[];
  billing_address: { name?: string | null; company?: string | null; address1?: string | null; address2?: string | null; city?: string | null; zip?: string | null; country_code?: string | null };
}

export const SELLER: Invoice['seller'] = {
  name: 'Shop Beispiel GmbH', vatId: 'DE123456789', street: 'Werkstrasse 4', city: 'Leipzig', postcode: '04109', country: 'DE',
  electronicAddress: 'rechnung@shop-beispiel.example', electronicAddressScheme: 'EM',
  contact: { name: 'Shop Team', phone: '+49 341 7654321', email: 'rechnung@shop-beispiel.example' },
};

/** Shopify's tax rate is a decimal fraction (0.19). Four decimals at most, so rounding the scaled value is exact, not a float guess. */
const percentOf = (rate: number): number => Math.round(rate * 10000) / 100;

export function mapShopifyOrder(o: ShopifyOrder): Invoice {
  if (o.taxes_included) throw new Error('tax-inclusive prices are not mapped by this example');
  const b = o.billing_address;
  const buyerName = b.company || b.name;
  if (!buyerName) throw new Error('billing_address needs a company or a name');
  if (!b.country_code) throw new Error('billing_address.country_code is required (BT-55)');
  return {
    number: `SHOP-${o.name.replace(/^#/, '')}`, issueDate: o.created_at.slice(0, 10), currency: o.currency,
    buyerReference: o.name, // XRechnung needs a BT-10 buyer reference; the order name stands in for it here
    seller: SELLER,
    buyer: {
      name: buyerName, ...(b.address1 ? { street: b.address1 } : {}), ...(b.address2 ? { street2: b.address2 } : {}),
      ...(b.city ? { city: b.city } : {}), ...(b.zip ? { postcode: b.zip } : {}), country: b.country_code,
      ...(o.email ? { electronicAddress: o.email, electronicAddressScheme: 'EM' } : {}),
    },
    payment: { meansCode: '58', iban: 'DE89370400440532013000', accountName: SELLER.name },
    lines: o.line_items.map((l) => {
      const rate = l.tax_lines[0]?.rate;
      if (rate === undefined || rate <= 0) throw new Error(`line "${l.title}": only lines with a positive tax rate are mapped`);
      // "89.90" -> 8990 with exact decimal arithmetic; no parseFloat anywhere on the money path.
      return { name: l.title, ...(l.sku ? { sellerAssignedId: l.sku } : {}), quantity: l.quantity, unitPriceMinor: fromMajor(l.price), unitCode: 'C62', taxCategory: 'S' as const, taxRate: percentOf(rate) };
    }),
  };
}

export interface ConvertResult { invoice: Invoice; xml: string; warnings: string[]; validation: ValidatedDocument }

export async function convertOrder(order: ShopifyOrder): Promise<ConvertResult> {
  const invoice = mapShopifyOrder(order);
  const computed = totals(invoice).grand;
  const stated = fromMajor(order.total_price);
  if (computed !== stated) throw new Error(`totals differ: order total_price is ${stated}, the lines give ${computed} (minor units); shipping and discounts are not mapped`);
  const { xml, warnings } = createXml(invoice, 'xrechnung-ubl');
  return { invoice, xml, warnings, validation: await validate(xml) };
}

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const order = JSON.parse(readFileSync(process.argv[2] ?? path.join(here, 'order.json'), 'utf8')) as ShopifyOrder;
  const r = await convertOrder(order);
  console.log(r.xml);
  console.error(`valid=${r.validation.valid}, rule sets: ${r.validation.ruleSets.map((x) => x.id).join(', ')}${r.warnings.length ? `; warnings: ${r.warnings.join(' | ')}` : ''}`);
  if (!r.validation.valid) {
    for (const f of r.validation.results.filter((x) => x.severity === 'error' || x.severity === 'fatal')) console.error(`${f.ruleId}: ${f.message}`);
    process.exit(1);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
