# npm library

`@conformo/toolkit` is the whole of Conformo as functions: create, validate, convert, parse, explain a rule, look up a country's requirements. It runs in Node 20+ and in the browser, with no account and no server. The CLI, the MCP server and the HTTP API are thin layers over it.

```bash
npm install @conformo/toolkit
```

## Create and check an XRechnung

The invoice is the EN 16931 model. XRechnung adds a buyer reference (BT-10, the Leitweg-ID for public authorities), a seller contact (BG-6) and electronic addresses.

```js
import { createXml, createPdf, validate, convert, parse, explainRule, getRequirements, InvoiceInputError } from '@conformo/toolkit';

const invoice = {
  number: 'RE-2027-0001', issueDate: '2027-01-15', currency: 'EUR', buyerReference: '04011000-1234512345-06',
  seller: { name: 'Muster Software GmbH', vatId: 'DE123456789', street: 'Hauptstrasse 1', postcode: '10115', city: 'Berlin', country: 'DE',
    electronicAddress: 'rechnung@muster.example', contact: { name: 'Erika Mustermann', phone: '+49 30 1234567', email: 'erika@muster.example' } },
  buyer: { name: 'Stadt Beispielhausen', street: 'Rathausplatz 1', postcode: '50667', city: 'Beispielhausen', country: 'DE',
    electronicAddress: '04011000-1234512345-06', electronicAddressScheme: '0204' },
  payment: { meansCode: '58', iban: 'DE89370400440532013000' },
  lines: [{ name: 'Wartung Dezember', quantity: 8, unitCode: 'HUR', unitPriceMinor: 9500, taxCategory: 'S', taxRate: 19 }],
};

const { xml } = createXml(invoice, 'xrechnung-cii');
const checked = await validate(xml);
console.log(checked.valid, checked.ruleSets.map((r) => r.id));   // true [ 'en16931-cii', 'xrechnung-cii' ]
```

```js test-only
if (!checked.valid) throw new Error('library sample: XRechnung not valid');
```

## A ZUGFeRD / Factur-X PDF

A PDF/A-3 with the XML embedded. Byte-for-byte deterministic: the same invoice always gives the same file.

```js
const { pdf, xmlFilename, conformanceLevel } = await createPdf(invoice, { profile: 'xrechnung', template: 'modern' });
console.log(xmlFilename, conformanceLevel, (await validate(pdf)).valid);   // xrechnung.xml XRECHNUNG true
```

```js test-only
if (xmlFilename !== 'xrechnung.xml' || !(await validate(pdf)).valid) throw new Error('library sample: PDF');
```

## Convert, parse, explain

```js
const ubl = await convert(xml, 'xrechnung-ubl');          // CII to UBL; totals are checked, never silently changed
const read = await parse(ubl.xml);                         // back into the model
console.log(read.invoice.number, read.totalsCheck.matches); // RE-2027-0001 true
console.log(explainRule('BR-DE-15').official[0]?.text);    // the KoSIT wording of the rule
console.log(getRequirements('DE').conformoSupport.xrechnung); // { generate: true, read: true, validate: true, note: '...' }
```

```js test-only
if (read.invoice.number !== 'RE-2027-0001' || !read.totalsCheck.matches) throw new Error('library sample: convert/parse');
```

## Mistakes are reported, not thrown as TypeErrors

```js
try {
  createXml({ ...invoice, seller: { ...invoice.seller, country: 'Germany' } }, 'cii');
} catch (err) {
  if (!(err instanceof InvoiceInputError)) throw err;
  console.log(err.issues[0]);   // { path: 'seller.country', bt: 'BT-40', severity: 'error', message: '...' }
}
```

Formats for `createXml`: `cii`, `cii-extended`, `ubl`, `xrechnung-cii`, `xrechnung-ubl`, `peppol-ubl`. Profiles for `createPdf`: `en16931`, `xrechnung`, `extended`. Lower-level packages (`@conformo/core`, `@conformo/formats`, `@conformo/validate`, `@conformo/parse`, `@conformo/pdf`) are published separately for people who need only one part.
