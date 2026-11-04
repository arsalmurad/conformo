# Changelog

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
