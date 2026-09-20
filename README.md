# invoice-engine

Invoices that are legally valid, not just good-looking.

EN 16931 semantic model, serialized to Factur-X / ZUGFeRD / XRechnung / UBL /
Peppol BIS, validated against the official CEN Schematron and each country's
own rules. Runs in a browser. No Chromium, no LibreOffice, no Java.

## Status

Early. The core is proven, the product is not built yet.

| Capability | State |
|---|---|
| EN 16931 core model, tax, totals | working, 16 tests |
| CII serializer | passes official XSD + 204-rule Schematron |
| PDF/A-3b with embedded XML | passes 25-point audit, deterministic |
| French CTC (BR-FR Flux 2) | 77 rules fired, 0 failures |
| UBL 2.1, XRechnung, Peppol | not started |
| Validator package, UI, CLI | not started |

## Quick start

    npm install
    npm run typecheck && npm run test
    npm run build:sample        # -> out/invoice.pdf + out/factur-x.xml

To run the official-schema validation you also need Python:

    pip install factur-x pikepdf lxml
    npm run validate

## Reading

- `CONTRIBUTING.md` is the contract for this repo. Read it before changing anything.
- `docs/pdf-traps.md` is why Factur-X generation usually fails silently.

## License

Apache-2.0.
