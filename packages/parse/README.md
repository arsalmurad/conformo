# @conformo/parse

Reads CII, UBL, XRechnung and Factur-X / ZUGFeRD PDFs into the EN 16931 model. The XML parser refuses DOCTYPE and entities (no XXE) and has size, depth and node limits.

```js
import assert from 'node:assert/strict';
import { buildCII } from '@conformo/formats';
import { detectXmlFormat } from '@conformo/parse';

const xml = buildCII({
  number: 'INV-1', issueDate: '2027-01-15', currency: 'EUR',
  seller: { name: 'Seller GmbH', country: 'DE' }, buyer: { name: 'Buyer GmbH', country: 'DE' },
  lines: [{ name: 'Work', quantity: 1, unitPriceMinor: 10000, taxCategory: 'S', taxRate: 19 }],
});
const { format, invoice } = detectXmlFormat(xml);
assert.equal(format, 'cii');
assert.equal(invoice.number, 'INV-1');
```
