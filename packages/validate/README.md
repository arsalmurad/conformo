# @conformo/validate

Runs the official Schematron rules and XSDs on an e-invoice, in Node or in a browser, with no server.

```js
import assert from 'node:assert/strict';
import { buildUBL } from '@conformo/formats';
import { validate } from '@conformo/validate';

const xml = buildUBL({
  number: 'INV-1', issueDate: '2027-01-15', currency: 'EUR',
  seller: { name: 'Seller GmbH', vatId: 'DE123456789', country: 'DE' },
  buyer: { name: 'Buyer GmbH', country: 'DE' },
  payment: { meansCode: '58', iban: 'DE89370400440532013000' },
  lines: [{ name: 'Work', quantity: 1, unitPriceMinor: 10000, taxCategory: 'S', taxRate: 19 }],
});
const result = await validate(xml);                 // syntax and profile are read from the document
assert.equal(result.valid, true);
assert.deepEqual(result.ruleSets.map((r) => r.id), ['en16931-ubl']);
assert.equal(result.xsd.valid, true);
```

What runs, picked from the root element and BT-24: EN 16931 (CEN) for CII and UBL; plus the KoSIT XRechnung rules for XRechnung; plus Peppol BIS Billing 3.0 for Peppol; plus the French CTC rules with `{ country: 'FR' }`. `result.ruleSets` lists exactly what ran with its source version; `result.xsd` says whether the XSD ran. Browser: `@conformo/validate/page` (rule sets; XSD is Node only, see docs/KNOWN-GAPS.md).
