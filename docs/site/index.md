# Conformo

Conformo turns invoice data into e-invoices (XRechnung, ZUGFeRD, Factur-X, UBL, Peppol BIS) and checks them against the official rules, locally, as a free npm library, a CLI, an MCP server and an HTTP API.

## Quickstart

```bash
npm install @conformo/toolkit
```

```js
import { createXml, validate } from '@conformo/toolkit';
const invoice = { number: 'INV-1', issueDate: '2027-01-15', currency: 'EUR', seller: { name: 'Seller GmbH', vatId: 'DE123456789', country: 'DE' }, buyer: { name: 'Buyer GmbH', country: 'DE' }, payment: { meansCode: '58', iban: 'DE89370400440532013000' }, lines: [{ name: 'Work', quantity: 2, unitPriceMinor: 5000, taxCategory: 'S', taxRate: 19 }] };
const { xml } = createXml(invoice, 'cii');            // EN 16931 CII, the XML inside ZUGFeRD and Factur-X
const result = await validate(xml);                   // the official CEN Schematron, run locally
console.log(result.valid, result.ruleSets.map((r) => r.id)); // true [ 'en16931-cii' ]
```

```js test-only
if (!result.valid || result.ruleSets[0].id !== 'en16931-cii') throw new Error('the quickstart no longer produces a valid invoice');
```

Money is always integer minor units: `5000` is EUR 50.00. Every code sample on this site is run by the test suite, so if a sample stops working, the build fails.
