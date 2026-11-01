# Germany 2027 in 10 minutes

What a developer needs to issue a German B2B e-invoice that the law accepts, with code that runs. Every `js` block on this
page is executed by `test/doctests.test.ts`, so if this page stops working the build fails.

## What the rule says

| | Date | Source |
|---|---|---|
| Every business must be able to **receive** an EN 16931 e-invoice | 2025-01-01 | BMF letter of 15 October 2024 on the mandatory e-invoice; § 14 UStG |
| Businesses with prior-year turnover **above EUR 800,000** must **issue** one | 2027-01-01 | § 27 (38) UStG |
| **Everyone** must issue one | 2028-01-01 | § 27 (38) UStG |

Accepted formats: **XRechnung** (CII or UBL) and **ZUGFeRD 2.x** hybrid PDFs, but not the ZUGFeRD profiles MINIMUM and
BASIC WL, because those are not EN 16931 invoices. These dates and the format rule are recorded in the project's
compliance dataset (`conformo requirements DE`). That dataset's German row was last read from the EU's eInvoicing
country page, not from the BMF letter or the statute themselves; the build environment that produced this version could
not reach those sources, so treat the legal wording as something to confirm with your tax adviser. What Conformo proves is
technical, not legal: the documents below pass the official validators (see [CONFORMANCE.md](CONFORMANCE.md)).

## 1. Install

```bash
npm install @conformo/toolkit
```

## 2. Describe the invoice

Money is always integer minor units (cents). `buyerReference` is the Leitweg-ID when the buyer is a public body (rule
BR-DE-15); for a private buyer put any reference the buyer asked for.

```js
import assert from 'node:assert/strict';
import { createXml, createPdf, validate, parse, InvoiceInputError } from '@conformo/toolkit';

export const invoice = {
  number: 'RE-2027-0042',
  issueDate: '2027-01-15',
  dueDate: '2027-02-14',
  currency: 'EUR',
  buyerReference: '04011000-1234512345-35',          // Leitweg-ID (BT-10)
  seller: {
    name: 'Muster Software GmbH', vatId: 'DE123456789',
    street: 'Hauptstraße 1', postcode: '10115', city: 'Berlin', country: 'DE',
    electronicAddress: 'rechnung@muster-software.example', electronicAddressScheme: 'EM',
    contact: { name: 'Erika Mustermann', phone: '+49 30 1234567', email: 'erika@muster-software.example' },
  },
  buyer: {
    name: 'Stadt Beispielhausen',
    street: 'Rathausplatz 1', postcode: '50667', city: 'Beispielhausen', country: 'DE',
    electronicAddress: '04011000-1234512345-35', electronicAddressScheme: '0204',   // 0204 = Leitweg-ID
  },
  payment: { meansCode: '58', iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', reference: 'RE-2027-0042' },
  lines: [{ name: 'Wartung Dezember', quantity: 8, unitCode: 'HUR', unitPriceMinor: 9500, taxCategory: 'S', taxRate: 19 }],
};
```

## 3. Make an XRechnung and check it

```js
const { xml, warnings } = createXml(invoice, 'xrechnung-ubl');
const result = await validate(xml);

assert.equal(result.valid, true);
assert.deepEqual(result.ruleSets.map((r) => r.id), ['en16931-ubl', 'xrechnung-ubl']);   // EN 16931 + the KoSIT XRechnung rules
assert.equal(result.xsd.ran && result.xsd.valid, true);                                  // UBL 2.1 schema
console.log(result.ruleSets.map((r) => `${r.label}: ${r.fired} rules checked, ${r.failed} failed`).join('\n'));
```

`result.ruleSets` is the proof of what was checked; `result.detected` says how the document was recognised (root element and
the specification identifier BT-24). Use `xrechnung-cii` for the CII flavour.

## 4. Make a ZUGFeRD / Factur-X PDF

A hybrid PDF/A-3 with the XML embedded. The `xrechnung` profile writes the ZUGFeRD XRECHNUNG profile (the attachment is
named `xrechnung.xml`); `en16931` writes the EN 16931 (COMFORT) profile (`factur-x.xml`).

```js
for (const profile of ['en16931', 'xrechnung']) {
  const out = await createPdf(invoice, { profile });
  const check = await validate(out.pdf);                 // validates the XML inside the PDF
  assert.equal(check.valid, true);
  assert.equal(check.origin, 'pdf');
  console.log(profile, out.xmlFilename, out.conformanceLevel, `${out.pdf.length} bytes`);
}
```

The PDF is deterministic: the same invoice gives the same bytes, because its timestamps come from the issue date.

## 5. SEPA direct debit and attachments

Direct debit (BT-89 mandate, BT-90 creditor id) and attached documents (BG-24) are part of the model:

```js
const richer = {
  ...invoice,
  payment: {
    meansCode: '59', reference: invoice.number,        // 59 = SEPA direct debit; BR-DE-25-b: send no credit-transfer IBAN (BT-84) with it
    directDebit: { mandateId: 'MANDAT-2026-001', creditorId: 'DE98ZZZ09999999999', debitedAccountIban: 'DE02120300000000202051' },
  },
  attachments: [{ id: 'ANL-1', description: 'Leistungsnachweis', content: Buffer.from('%PDF-1.4 demo').toString('base64'), mimeCode: 'application/pdf', filename: 'leistung.pdf' }],
};
const r = await validate(createXml(richer, 'xrechnung-cii').xml);
assert.equal(r.valid, true);
```

## 6. What a mistake looks like

Missing or malformed input never ends in a `TypeError`. It ends in one error that lists everything wrong, with the EN 16931
term for each problem:

```js
try {
  createXml({ number: 'X', lines: [] }, 'xrechnung-cii');
  assert.fail('should have thrown');
} catch (e) {
  assert.ok(e instanceof InvoiceInputError);
  console.log(e.message);                                  // e.issues = [{ path, bt, severity, message }, ...]
  assert.ok(e.issues.some((i) => i.path === 'lines' && i.bt === 'BG-25'));
  assert.ok(e.issues.some((i) => i.path === 'seller' && i.bt === 'BG-4'));
}
```

And a document that is well-formed but breaks a German rule is reported by the KoSIT rules, with a plain-language fix. Here the
buyer reference (BR-DE-15) is stripped from an otherwise valid XRechnung, as if it came from someone else's software:

```js
const received = createXml(invoice, 'xrechnung-ubl').xml.replace(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, '');
const verdict = await validate(received);
assert.equal(verdict.valid, false);
const f = verdict.results.find((x) => x.ruleId === 'BR-DE-15');
assert.ok(f && f.ruleSet === 'xrechnung-ubl');
console.log(f.message, '\n', f.plainLanguage?.fix);
```

## 7. Read what you receive

```js
const incoming = await parse(createXml(invoice, 'xrechnung-cii').xml);
assert.equal(incoming.invoice.number, 'RE-2027-0042');
assert.equal(incoming.totalsCheck.matches, true);          // stated totals equal the totals recomputed from the lines
```

## What this does not do

It does not send anything: delivery by e-mail, a portal or the Peppol network is outside this toolkit. It does not archive
(§ 147 AO) and it does not decide whether you are obliged. Command line equivalents: `conformo create`, `conformo validate`,
`conformo requirements DE`.
