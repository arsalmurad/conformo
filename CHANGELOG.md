# Changelog

## 0.2.4 (2026-11-10)

Packages: @conformo/formats 0.2.1, @conformo/validate 0.2.2, @conformo/toolkit 0.2.3, @conformo/cli 0.2.3, @conformo/mcp-server 0.2.4, @conformo/server 0.2.4.

- **Unknown XRechnung identifiers are now rejected, like the official KoSIT validator does.** KoSIT picks its rule set by comparing BT-24 character for
  character with its known identifiers. A document whose BT-24 names XRechnung but is not exactly one of them (for example
  `urn:xoev-de:kosit:standard:xrechnung_3.0`, the same with the older `urn:cen.eu:en16931:2017#compliant#` prefix, or the correct identifier with a space
  at the end) finds no rule set there and is rejected. Conformo used to treat such a file as XRechnung 3.0, show only a BR-DE-21 warning and call it valid. It now
  reports an error, `XRECHNUNG-ID-UNKNOWN`, which names the identifier it found and the one KoSIT expects, and still runs all rule sets so the other findings
  are listed. `conformo explain XRECHNUNG-ID-UNKNOWN` explains it. The extension identifier is not accepted on a UBL CreditNote, because KoSIT has no extension scenario for that
  document type. Plain EN 16931, Peppol and Factur-X / ZUGFeRD identifiers are not affected. A BT-24 that does not name XRechnung at all still only gets the
  existing warning; `docs/KNOWN-GAPS.md` says why.
- **Notice for a wrong Leitweg-ID check digit.** KoSIT and Mustang do not check the two check digits at the end of a Leitweg-ID (ISO/IEC 7064 MOD 97-10). When
  BT-10 has the shape of a Leitweg-ID and the digits are wrong, the result now carries a `LEITWEG-CHECK-DIGITS` warning that names the digits it should have.
  It is a Conformo check, not a KoSIT rule, and it never changes the verdict. Nothing is said when BT-10 is not shaped like a Leitweg-ID. The shape test now follows the
  format specification (the optional fine address may be empty and letters may be in either case).
- **`conformo explain BR-DE-21`** now has a plain explanation and lists both XRechnung rule sets (it fired on CII too, but only the UBL one was shown). The
  official wording of a rule is no longer cut off at its first quotation mark.
- **The conformance corpus now includes scenario-selection cases.** Until now every official test invoice carried a correct BT-24, so the comparison with KoSIT
  only covered the rules, not the choice of rule set. A generated corpus of wrong identifiers, whitespace, letter case and the extension identifier on a CreditNote
  (CII, UBL Invoice, UBL CreditNote; 30 files) is now compared with KoSIT as well. KoSIT's "no scenario" counts as a rejection there. Agreement is 30 of 30, and 100% on the official test invoices as before.

## 0.2.3 (2026-11-06)

Packages: @conformo/validate 0.2.1, @conformo/parse 0.2.2, @conformo/toolkit 0.2.2, @conformo/cli 0.2.2, @conformo/mcp-server 0.2.3, @conformo/server 0.2.3.

- **No more false IBAN warnings (BR-DE-19, BR-DE-20).** The KoSIT XRechnung rules check an IBAN by turning it into a number of up to 34 digits and taking it
  modulo 97. SaxonJS, which runs the rules in Node and in the browser, computes whole numbers with floating point and loses precision above about 16 digits, so
  almost every valid IBAN in an XRechnung with payment means 58 or 59 got a false warning (the verdict stayed valid). The build now makes that one calculation
  exact, and fails if a new KoSIT release changes the function. The conformance report lists the patch, still compares against the publisher's unpatched rules in
  Saxon-HE, and has a new generated corpus (valid and invalid IBANs, payment means 58 and 59, CII and UBL) that the official test invoices did not cover.
- **No local paths in the published rule sets.** The compiled rule sets in @conformo/validate 0.2.0 contained the absolute path of the machine that built them
  (a user name and a temporary folder). They now carry a fixed public name, and `npm run pack:smoke` scans every file of every package, including what is
  inside the compressed files, and the built sites for local paths.
- **Readable results for syntax rules.** The rules that generators trip over (CII-DT-*, CII-SR-*, UBL-CR-*, UBL-DT-*, UBL-SR-*) now come with a plain-language
  explanation, built from the rule's family or written by hand (1,327 of 1,346 rules). The leading "- " the publisher's text left behind is removed. Every
  result also has `element`, `path` (for example "line 1 > NetPriceProductTradePrice > ChargeAmount") and `line`, and `fields` carries the business terms
  for amounts; `xpath` is unchanged. The CLI, the MCP tool and the validator page group repeated hits of one rule ("CII-DT-031, 12 places: ..."); the JSON
  `results` stay one entry per hit.
- **PDF container notice.** Validating a ZUGFeRD / Factur-X PDF now adds an informational notice naming the embedded file and the XMP schema and version found
  (ZUGFeRD 2.0 files use `zugferd-invoice.xml` and the `zf` schema; ZUGFeRD 2.1 and later and Factur-X use `factur-x.xml`, or `xrechnung.xml`, and the `fx`
  schema). It also warns when the XMP conformance level or the embedded file name does not fit the profile in the XML. None of this changes the verdict.

## 0.2.2: @conformo/mcp-server and @conformo/server (2026-11-05)

- MCP tool descriptions rewritten for agents: each now says what the tool does, when to use it and which sibling to use instead, and what it does
  beyond its annotations (runs locally, writes files only on request). The shared disclaimer is no longer repeated in every tool; it stays in the
  server instructions. Every output field now has a description. Tool names, inputs, outputs and behaviour are unchanged.
- KSeF wording corrected in the MCP server, the HTTP API and the docs: FatturaPA and Facturae are not supported; KSeF FA(3) is written and
  schema-checked for domestic PLN invoices but cannot be read. It was previously described as not supported at all, which undersold what the
  toolkit does.
- `glama.json` names the maintainer for the Glama directory; the MCP Registry listing uses the new Conformo icon (`docs/media/conformo-icon.png`).

## 0.2.1: @conformo/pdf, parse, toolkit, cli, mcp-server, server (2026-11-05)

- PDF labels in English, German and French: `createPdf({ language: "en" | "de" | "fr" })`, CLI `--language`, MCP `create_invoice_pdf` `language`,
  HTTP API `language`. The default (English) PDF is byte-identical to 0.2.0 and the embedded XML is identical in every language. The visible-totals check in
  `@conformo/parse` reads the money labels in all three languages.
- `@conformo/mcp-server` carries `mcpName: io.github.arsalmurad/conformo` and ships `server.json` for the official MCP Registry. Its README now opens with
  what it does and example prompts. Tools and their schemas are unchanged.

## @conformo/core 0.2.1 (2026-11-01)

- `checkInvoice()` type-checks every optional text field, contact field and list at runtime. A wrongly typed field from plain
  JavaScript (for example `electronicAddress` as an object) is now an `InvoiceInputError` naming the field and its BT id, not a
  raw `TypeError` from inside a serializer. Every serializer and the toolkit get this through `^0.2.0`; no other package changed.

## 0.2.0 (2026-11-01)

### Validation
- `validate()` now checks every format Conformo writes, from one code path in Node and in the browser: EN 16931 (CII and UBL, CEN release validation-1.3.17),
  XRechnung 3.0.x (KoSIT, CII and UBL), Peppol BIS Billing 3.0 (UBL), the French CTC rules, and the XSDs (Node). Syntax and profile are read from the root element and
  BT-24; the result lists exactly which rule sets ran, their sources and the XSD outcome. KoSIT's severity table is applied for XRechnung and reported per finding.
- Compiled rule sets ship gzipped: the validate package's artefacts went from about 21 MB to 1.4 MB unpacked.
- Plain-language explanations now cover all 223 rules of the CEN sets (was 203, from the previous rule set).

### Model and formats
- Every EN 16931 BT and BG is in the model, both serializers and both readers, with a round-trip proof (`docs/EN16931-COVERAGE.md`, generated and drift-checked).
- `checkInvoice()` and a typed `InvoiceInputError` (every issue with path and BT id) replace raw `TypeError`s. `payment` (BG-16) is optional.
- Sub-cent unit prices, price base quantity, line allowances and charges, stated line net amounts and stated VAT amounts (within one minor unit) are represented exactly.
- XRechnung now writes `urn:xeinkauf.de:kosit:xrechnung_3.0` (the identifier the KoSIT validator matches); BR-DE-14 rate for category O; delivery without an address no longer
  writes an empty address; BT-8 uses the right code list per syntax; BT-84 as proprietary id; BT-41/56 as department name.
- ZUGFeRD / Factur-X PDFs: EN 16931, XRECHNUNG (`xrechnung.xml`) and EXTENDED (EN 16931 content) profiles with the right XMP.
- KSeF FA(3): generation for domestic PLN invoices and validation against the Ministry of Finance XSD. No submission.

### Surfaces
- `@conformo/toolkit` (new): create, validate, convert, parse, explain, requirements in one Node API.
- CLI: `create`, `convert`, `validate` (auto-detect, `--json`, exit codes), `parse`, `explain`, `requirements`.
- MCP server rebuilt: structured input schema (`@conformo/schema`), 7 tools with output schemas and annotations, stdio and stateless Streamable HTTP.
- `@conformo/server` (new): optional stateless HTTP API with generated OpenAPI 3.1.
- Web app: Germany 2027 (XRechnung profile) choice. Validator page: every syntax, shows which rule sets ran.
- `examples/` (Stripe, Shopify, Hono, MCP agent), `docs/GERMANY-2027.md`, `docs/COMPARISON.md`.

### Build and trust
- One manifest (`tools/artefacts.manifest.json`) pins every third-party artefact by version and SHA-256 or commit; fetching is idempotent and offline-cacheable; Python
  requirements are pinned (`tools/requirements.txt`); the rule sets build without bash or Python.
- `docs/CONFORMANCE.md`: generated comparison with Saxon-HE, lxml and the official KoSIT validator on the KoSIT, Peppol and CEN corpora; CI regenerates it.
- Pack smoke test and doc-tests: every code block in the README and docs runs against the packed tarballs.
- Property and fuzz tests (fast-check).

### Known gaps
See `docs/KNOWN-GAPS.md`.
