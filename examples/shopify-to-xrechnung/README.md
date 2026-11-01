# Shopify order to XRechnung (UBL)

`convert.ts` exports `convertOrder(order)`: it maps a Shopify-shaped order to the Conformo `Invoice`, writes XRechnung UBL, and validates it.

```bash
npx tsx examples/shopify-to-xrechnung/convert.ts
```

The XML is printed to stdout, the validation summary to stderr, and the exit code is non-zero if the document does not validate.

Prices are decimal strings (`"89.90"`). They are converted to minor units with `fromMajor` from `@conformo/core`, which is exact decimal arithmetic: no `parseFloat`, no float multiplication on the money path. Shopify's tax `rate` (`0.19`) is converted to a percentage by rounding the value scaled by 10000, which is exact for rates with up to four decimals.

## The input is synthetic and simplified

`order.json` is hand-written to resemble the Shopify Admin REST order object. It is not a captured order and the mapping does not cover every Shopify feature.

Read: `name`, `email`, `created_at`, `currency`, `taxes_included` (must be false), `total_price`, `line_items[]` (`title`, `sku`, `quantity`, `price`, `tax_lines[0].rate`), `billing_address`.

Ignored: `shipping_lines` (so an order with shipping would not match its `total_price` and the example throws), discounts and discount allocations, refunds, gift cards, tips, tax-inclusive pricing, zero-rated or exempt lines, multiple tax lines per item, multiple currencies (`presentment_money`), fulfilments, customer records, and everything else. The seller is a constant to replace with your own data, and the order name stands in for the XRechnung buyer reference (BT-10).
