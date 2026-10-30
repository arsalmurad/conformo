# @conformo/toolkit

Valid e-invoices as a function call: create (XML or Factur-X / ZUGFeRD PDF), validate, convert, parse, explain a rule, look up country requirements. Runs locally; no account, no server. The CLI, the MCP server and the HTTP API are thin layers over this package.

```js
import assert from 'node:assert/strict';
import { createXml, createPdf, validate } from '@conformo/toolkit';

const invoice = {
  number: 'INV-1', issueDate: '2027-01-15', currency: 'EUR', buyerReference: 'PO-77',
  seller: { name: 'Seller GmbH', vatId: 'DE123456789', street: 'Hauptstrasse 1', postcode: '10115', city: 'Berlin', country: 'DE',
    electronicAddress: 'billing@seller.example', electronicAddressScheme: 'EM', contact: { name: 'Ann', phone: '+49 30 1', email: 'ann@seller.example' } },
  buyer: { name: 'Buyer GmbH', street: 'Ring 2', postcode: '50667', city: 'Koeln', country: 'DE', electronicAddress: 'ap@buyer.example', electronicAddressScheme: 'EM' },
  payment: { meansCode: '58', iban: 'DE89370400440532013000' },
  lines: [{ name: 'Work', quantity: 2, unitPriceMinor: 5000, taxCategory: 'S', taxRate: 19 }],
};
const { xml } = createXml(invoice, 'xrechnung-cii');
assert.equal((await validate(xml)).valid, true);

const { pdf, xmlFilename } = await createPdf(invoice, { profile: 'xrechnung' });   // PDF/A-3 with xrechnung.xml inside
assert.equal(xmlFilename, 'xrechnung.xml');
assert.equal((await validate(pdf)).valid, true);
```

Formats: `cii`, `cii-extended`, `ubl`, `xrechnung-cii`, `xrechnung-ubl`, `peppol-ubl`. See [the Germany guide](../../docs/GERMANY-2027.md).
