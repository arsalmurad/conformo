# Stripe `invoice.finalized` to Factur-X / ZUGFeRD PDF

`handler.ts` exports `handleInvoiceFinalized(event)`: it maps a Stripe-shaped invoice to the Conformo `Invoice`, checks that the totals equal what Stripe charged, writes a PDF/A-3 with the XML embedded (profile `en16931`, or `xrechnung` when the buyer is German public sector), and validates the result.

```bash
npx tsx examples/stripe-to-zugferd/handler.ts
```

```bash
npx tsx examples/stripe-to-zugferd/handler.ts examples/stripe-to-zugferd/invoice-finalized-public-sector.json
```

The PDF goes to `out/examples/stripe-to-zugferd/` (or the directory given as the second argument). The exit code is non-zero if the produced document does not validate. In a real webhook you would verify Stripe's signature first, which this example does not do.

## The input is synthetic and simplified

`invoice-finalized.json` and `invoice-finalized-public-sector.json` are hand-written to resemble Stripe's `invoice.finalized` event. They are not captured from Stripe and the mapping does not cover every Stripe feature. Money is already in Stripe's smallest currency unit, which is Conformo's minor unit, so no conversion happens.

Read: `number`, `currency`, `created`, `due_date`, `customer_name`, `customer_email`, `customer_address`, `customer_tax_ids` (the `eu_vat` entry), `lines.data[]` (`description`, `quantity`, `price.unit_amount`, `tax_rates[0].percentage`), `total_tax_amounts`, `total`, and `metadata.leitweg_id` (an invented convention for where a German public buyer's Leitweg-ID lives).

Ignored, and not mapped: discounts and coupons, proration, tax-inclusive prices, zero-rated or exempt and reverse-charge lines (the example throws instead of guessing a VAT category), metered or tiered prices, credit notes, multiple tax rates per line, currencies with a different minor-unit exponent, payment status, hosted invoice URLs, and everything else in a real payload. The seller (Stripe does not carry it in this shape) is a constant you replace with your own data. If Stripe's total does not equal the total computed from the mapped lines, the handler throws rather than issuing a different document.
