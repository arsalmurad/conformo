# invoice-engine

Invoices that are legally valid, not just good-looking.

EN 16931 semantic model, serialized to Factur-X / ZUGFeRD / XRechnung / UBL /
Peppol BIS, validated against the official CEN Schematron and each country's
own rules. Runs in a browser. No Chromium, no LibreOffice, no Java.

## Status

Early. The core and the formats are proven, the product is not built yet.

| Capability | State |
|---|---|
| EN 16931 core model, exact-decimal money, tax, totals | working, 49 tests |
| CII serializer (Factur-X / ZUGFeRD) | passes official XSD + EN 16931 Schematron |
| UBL 2.1 serializer (Invoice + CreditNote) | passes official XSD + EN 16931 Schematron |
| Peppol BIS Billing 3.0 (UBL profile) | passes EN 16931 + Peppol Schematron |
| XRechnung 3.0 (CII and UBL) | passes EN 16931 + KoSIT Schematron |
| PDF/A-3b with embedded XML | passes 25-point audit, deterministic |
| French CTC (BR-FR Flux 2) | 77 rules fired, 0 failures |
| Validator package, UI, CLI | not started |

13 synthetic fixtures cover reverse charge, intra-community supply, zero-rated
and exempt VAT, category O, document-level allowances/charges, a credit note,
a German public-sector invoice, a full Peppol Belgian invoice, a tax
representative, and a foreign tax-currency total. One fixture is a deliberate
negative control that proves the validator actually rejects a wrong invoice.

## Quick start

    npm install
    npm run typecheck && npm run test
    npm run build:sample        # -> out/invoice.pdf + out/factur-x.xml

To run the official-schema validation you also need Python 3 (`py` on Windows,
`python3` elsewhere) and Saxon (for the XSLT-based CIUS Schematron):

    pip install factur-x pikepdf lxml saxonche
    npm run validate

## Reading

- `CONTRIBUTING.md` is the contract for this repo. Read it before changing anything.
- `docs/pdf-traps.md` is why Factur-X generation usually fails silently.

## License

Apache-2.0.
