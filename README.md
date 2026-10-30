# Conformo

Legally valid e-invoices as a function call or an AI tool call. Open source, and it runs where your data is.

You give it an invoice as JSON. You get back XRechnung, UBL, CII or a Factur-X / ZUGFeRD PDF, and a validation result from the
official rule sets that shows which rules ran. Nothing leaves your machine unless you send it.

**[Web app](https://conformo-three.vercel.app)** · **[Validator](https://conformo-validate.vercel.app)** · **[Country docs](https://conformo-docs.vercel.app)** · **[Germany 2027 guide](docs/GERMANY-2027.md)**

## Quickstart

```bash
npm install @conformo/toolkit
```

```js
import { createXml, validate } from '@conformo/toolkit';

const invoice = {
  number: 'INV-1', issueDate: '2027-01-15', currency: 'EUR', buyerReference: 'PO-77',
  seller: { name: 'Seller GmbH', vatId: 'DE123456789', street: 'Hauptstrasse 1', postcode: '10115', city: 'Berlin', country: 'DE',
    electronicAddress: 'billing@seller.example', electronicAddressScheme: 'EM', contact: { name: 'Ann', phone: '+49 30 1', email: 'ann@seller.example' } },
  buyer: { name: 'Buyer GmbH', street: 'Ring 2', postcode: '50667', city: 'Koeln', country: 'DE', electronicAddress: 'ap@buyer.example', electronicAddressScheme: 'EM' },
  payment: { meansCode: '58', iban: 'DE89370400440532013000' },
  lines: [{ name: 'Work', quantity: 2, unitPriceMinor: 5000, taxCategory: 'S', taxRate: 19 }],   // money is integer cents
};

const { xml } = createXml(invoice, 'xrechnung-cii');
const result = await validate(xml);
console.log(result.valid, result.ruleSets.map((r) => r.id));   // true [ 'en16931-cii', 'xrechnung-cii' ]
```

Leave out a required field and you get one `InvoiceInputError` listing every problem with its EN 16931 term (`{ path, bt, severity, message }`), not a
`TypeError`. This block is executed by [test/doctests.test.ts](test/doctests.test.ts) and against the packed npm tarballs by `npm run pack:smoke`,
so it cannot rot.

Other entry points: [CLI](docs/cli.md) (`npx @conformo/cli validate invoice.xml`), [MCP server](packages/mcp-server/README.md) for agents,
the [web app](https://conformo-three.vercel.app), and `docker compose up --build` to run the app yourself.

## What it does, and the test that proves each cell

"Validate" means the official rule sets and schemas, run locally; `result.ruleSets` lists what ran. Browser validation runs the Schematron rules;
XSD validation runs in Node only ([KNOWN-GAPS](docs/KNOWN-GAPS.md)).

| Format | Generate | Read | Validate (Node) | Validate (browser) | CLI | MCP |
|---|---|---|---|---|---|---|
| EN 16931 CII (Factur-X / ZUGFeRD EN 16931) | [yes](test/cii.test.ts) | [yes](test/parse-roundtrip.test.ts) | [yes, rules + XSD](test/validate.test.ts) | [rules](test/validate-browser.test.ts) | [yes](test/cli-commands.test.ts) | [yes](test/mcp-server.test.ts) |
| EN 16931 UBL 2.1, Invoice and CreditNote | [yes](test/ubl.test.ts) | [yes](test/parse-roundtrip.test.ts) | [yes, rules + XSD](test/validate.test.ts) | [rules](test/validate-browser.test.ts) | [yes](test/cli-commands.test.ts) | [yes](test/mcp-server.test.ts) |
| XRechnung 3.x, CII and UBL | [yes](test/xrechnung.test.ts) | [yes](test/parse-roundtrip.test.ts) | [yes, KoSIT rules + XSD](test/validate.test.ts) | [rules](test/validate-browser.test.ts) | [yes](test/cli-commands.test.ts) | [yes](test/mcp-server.test.ts) |
| Peppol BIS Billing 3.0 (UBL), documents only | [yes](test/toolkit.test.ts) | [yes](test/parse-roundtrip.test.ts) | [yes](test/validate.test.ts) | [rules](test/validate-browser.test.ts) | [yes](test/cli-commands.test.ts) | [yes](test/mcp-server.test.ts) |
| Factur-X / ZUGFeRD PDF: EN 16931, XRECHNUNG, EXTENDED\* | [yes](test/toolkit.test.ts) | [yes](test/parse-pdf.test.ts) | [embedded XML](test/toolkit.test.ts) | [validator page](packages/validator-page) | [yes](test/cli-commands.test.ts) | [yes](test/mcp-server.test.ts) |
| French CTC rules (BR-FR Flux 2, CII) | partly ([fixture](test/profile-validators.test.ts)) | yes | [yes](test/validate.test.ts) | [rules](test/validate-browser.test.ts) | [yes](test/cli-commands.test.ts) | [yes](test/mcp-server.test.ts) |
| FatturaPA, KSeF FA(3), Facturae | no | no | no | no | no | no |

\* EXTENDED is written with EN 16931 content only (no EXTENDED-only fields) and only its XSD is checked. MINIMUM and BASIC WL are not offered: they are not
EN 16931 invoices and are not accepted for German B2B from 2027.

How well it agrees with the official validators, on the official sample files, is measured and published in [docs/CONFORMANCE.md](docs/CONFORMANCE.md)
(regenerated in CI). Every EN 16931 business term and where it lives in the model: [docs/EN16931-COVERAGE.md](docs/EN16931-COVERAGE.md).

## What this does not do yet

- **No transmission.** It makes and checks documents. It does not send them over the Peppol network, to a French *plateforme agréée* (PA, formerly PDP),
  to Poland's KSeF, or to Italy's SdI.
- **No FatturaPA, KSeF FA(3) or Facturae** serializer, reader or validator. The dataset below lists those requirements; the toolkit says they are unsupported.
- **No legal advice and no archiving.** It does not decide whether you are obliged to issue an e-invoice, and it does not do retention.
- **XSD validation in the browser** is not available; Node has it.
- **Official ZUGFeRD / Factur-X sample PDFs** were not part of the conformance run (their sites were unreachable when v0.2 was built).

## Which countries require this

Generated from a sourced, versioned dataset ([packages/compliance-data](packages/compliance-data)). Issuing and receiving are separate obligations with
separate dates, so they are separate columns. A window marked unverified could not be traced to a primary source when it was added.

<!-- COMPLIANCE-MATRIX:START -->
<!-- Generated by tools/generate-readme-matrix.ts from packages/compliance-data. Do not hand-edit; edit the source data instead. -->

| Country | B2G issuing | B2B issuing | B2B receiving | Thresholds and phasing | Format(s) | Last verified |
|---|---|---|---|---|---|---|
| Belgium | Mandatory since 2023-11-01 | Mandatory since 2026-01-01 | Mandatory since 2026-01-01 | B2G send 2023-11-01: Phased in by contract value: contracts >= EUR 215,000 from 2022-11-01, >= EUR 30,000 from 2023-05-01, < EUR 30,000 from 2023-11-01. | peppol-bis-3.0 | 2025-08-14, [source](https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/eInvoicing+in+Belgium) |
| France | Mandatory since 2019-11-01 | Mandatory since 2026-09-01<br>Planned from 2027-09-01 | Mandatory since 2026-09-01 | B2B send 2026-09-01: Large and medium-sized enterprises must issue e-invoices from this date.<br>B2B send 2027-09-01: Small and micro-enterprises must issue e-invoices from this date.<br>B2B receive 2026-09-01: All VAT-registered businesses must be able to receive structured e-invoices from this date. | cii, ubl-2.1, factur-x | 2025-08-14, [source](https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/eInvoicing+in+France) |
| Germany | Mandatory since 2019-11-01 | Planned from 2027-01-01<br>Planned from 2028-01-01 | Mandatory since 2025-01-01 | B2B receive 2025-01-01: All companies must be able to accept EN 16931-compliant e-invoices from this date.<br>B2B send 2027-01-01: Businesses with turnover above EUR 800,000 must issue e-invoices from this date.<br>B2B send 2028-01-01: All businesses must issue e-invoices from this date. | xrechnung, zugferd, peppol-bis-3.0 | 2025-08-14, [source](https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/eInvoicing+in+Germany) |
| Italy | Mandatory since 2015-03-31 | Mandatory since 2019-01-01 | Mandatory since 2019-01-01 | B2B both 2019-01-01: Universal since January 2024: flat-rate ('forfettario') taxpayers were originally excluded below EUR 65,000 turnover, the threshold was reduced to EUR 25,000 in July 2022, and the exclusion was fully removed as of January 2024. | fatturapa | 2025-08-14, [source](https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/eInvoicing+in+Italy) |
| Netherlands | Mandatory since 2019-11-01 | Voluntary | Voluntary | B2G send 2019-11-01: Applies to public procurement contracts above EU procurement thresholds. | peppol-bis-3.0, ubl-2.1, other | 2025-08-14, [source](https://ec.europa.eu/digital-building-blocks/sites/display/DIGITAL/eInvoicing+in+the+Netherlands) |
| Poland | — | Mandatory since 2026-02-01<br>Mandatory since 2026-04-01<br>Unverified from 2027-01-01 | Mandatory since 2026-02-01<br>Mandatory since 2026-04-01<br>Unverified from 2027-01-01 | B2G receive 2019-08-01: Contracts >= EUR 30,000 from 2019-04-18; all contracting authorities from 2019-08-01.<br>B2B both 2026-02-01: Large taxpayers (annual revenue above PLN 200 million) from 2026-02-01.<br>B2B both 2026-04-01: All other VAT taxpayers from 2026-04-01, except the smallest taxpayers below.<br>B2B both 2027-01-01: The smallest taxpayers join from 2027-01-01 (the exact size criterion is not recorded here). | peppol-bis-3.0, ksef-fa | 2025-08-14, [source](https://ec.europa.eu/digital-building-blocks/sites/spaces/einvoicingCFS/pages/881983593/2025+Poland+2025+eInvoicing+Country+Sheet), some windows unverified |
| Spain | Mandatory since 2015-01-15 | Planned | Planned | B2G send 2015-01-15: Invoices over EUR 5,000 to public administration suppliers.<br>B2B both : Under Law 18/2022 ('Crea y Crece'): once the implementing technical regulations are enacted, companies with EUR 8 million+ annual revenue get a 1-year compliance deadline, other businesses a 2-year deadline. | facturae | 2025-02-04, [source](https://ec.europa.eu/digital-building-blocks/sites/pages/viewpage.action?pageId=892470070) |

<!-- COMPLIANCE-MATRIX:END -->

Detail per country: [conformo-docs.vercel.app](https://conformo-docs.vercel.app), or `npx @conformo/cli requirements DE`.

## Principles

Money is integer minor units, with exact-decimal helpers for quantities, prices and rates. Output is deterministic (the same invoice gives the same
bytes). No headless browser anywhere in the PDF path. `@conformo/core` and `@conformo/formats` have no runtime dependencies. Compliance is shown, not
claimed: the validator reports the rule sets it ran.

## Anti-goals

Not accounting, payroll, expenses, inventory, CRM or time tracking. The open-source core and the web app never require an account or a server.
An optional, stateless HTTP API and remote MCP server may exist; they hold no data and are self-hostable, so you can run them where your data is.

## Contributing / building from source

[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) to build, test or run this repo, [CONTRIBUTING.md](CONTRIBUTING.md) for the invariants,
[docs/DECISIONS.md](docs/DECISIONS.md) for decisions and [docs/KNOWN-GAPS.md](docs/KNOWN-GAPS.md) for what is missing and why.

## License

Apache-2.0.
