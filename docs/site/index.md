# Conformo

Create and check German, French and EU e-invoices in JavaScript. No Java, no server, and the same verdict as the official KoSIT validator.

You pass one invoice as JSON. Conformo writes XRechnung, ZUGFeRD / Factur-X (PDF or XML), UBL or Peppol BIS, and validates the result with the official KoSIT, CEN, Peppol and French rule files, run on your machine. Free and open source (Apache-2.0).

## Pick your entry point

- **[Library](library.md)**: `npm install @conformo/toolkit`. Works in Node and in the browser.
- **[CLI](cli.md)**: `npx @conformo/cli validate invoice.xml`, for scripts and CI pipelines.
- **[MCP server](mcp.md)**: lets Claude, Cursor or another AI agent create and check e-invoices locally.
- **[HTTP API](http.md)**: a stateless server you host yourself, described in OpenAPI.

Not a developer? The free [web app](https://conformo-three.vercel.app) makes an e-invoice in your browser, and the [validator](https://conformo-validate.vercel.app) checks one you received. No signup for either.

## Why you can trust the output

- It runs the official rule files unmodified and agrees 100% with the official KoSIT validator on the official test invoices. CI measures this on every change: [conformance report](../CONFORMANCE.md).
- A daily job watches KoSIT, CEN and OpenPeppol for new rule releases. A new version only ships if agreement is still 100%: [how updates work](../UPDATES.md).
- What it does not do yet is written down, not hidden: [limits](limits.md).

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
