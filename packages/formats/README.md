# @conformo/formats

Serializers over the EN 16931 model: CII (Factur-X / ZUGFeRD), UBL 2.1 (Invoice and CreditNote), XRechnung, Peppol BIS Billing 3.0. Zero runtime dependencies besides `@conformo/core`.

```js
import assert from 'node:assert/strict';
import { buildCII, buildUBL, InvoiceInputError } from '@conformo/formats';

const invoice = {
  number: 'INV-1', issueDate: '2027-01-15', currency: 'EUR',
  seller: { name: 'Seller GmbH', vatId: 'DE123456789', country: 'DE' },
  buyer: { name: 'Buyer GmbH', country: 'DE' },
  payment: { meansCode: '58', iban: 'DE89370400440532013000' },
  lines: [{ name: 'Work', quantity: 1, unitPriceMinor: 10000, taxCategory: 'S', taxRate: 19 }],
};
assert.match(buildCII(invoice), /<rsm:CrossIndustryInvoice/);
assert.match(buildUBL(invoice, { profile: 'peppol' }), /poacc:billing:3.0/);
assert.throws(() => buildCII({}), InvoiceInputError);   // a clear input error listing every problem, never a TypeError
```

Whether the output is valid is decided by the official validators; use `@conformo/validate` or `@conformo/toolkit`.
