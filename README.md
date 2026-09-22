# invoice-engine

Invoices that are legally valid, not just good-looking.

EN 16931 semantic model, serialized to Factur-X / ZUGFeRD / XRechnung / UBL /
Peppol BIS, validated against the official CEN Schematron and each country's
own rules. Runs in a browser. No Chromium, no LibreOffice, no Java.

## Status

The core, the formats, the validator and a first version of the app are
built and independently verified. Not yet built: receiving/parsing incoming
invoices, and the compliance dataset — see `the project's own tracker` for exactly
where the line is.

| Capability | State |
|---|---|
| EN 16931 core model, exact-decimal money, tax, totals | working, tested |
| CII serializer (Factur-X / ZUGFeRD) | passes official XSD + EN 16931 Schematron |
| UBL 2.1 serializer (Invoice + CreditNote) | passes official XSD + EN 16931 Schematron |
| Peppol BIS Billing 3.0 (UBL profile) | passes EN 16931 + Peppol Schematron |
| XRechnung 3.0 (CII and UBL) | passes EN 16931 + KoSIT Schematron |
| PDF/A-3b with embedded XML | passes 25-point audit, deterministic |
| French CTC (BR-FR Flux 2) | 77 rules fired, 0 failures |
| Validator (`@invoice-engine/validate`) | EN 16931 + French CTC compiled to SEF, runs client-side in a real browser, plain-language messages for 40 rules |
| CLI (`@invoice-engine/cli`) | `validate` command |
| App (`packages/ui`) — live validation, encrypted local persistence, offline PWA, seller/buyer profiles, percent-of-project billing, gapless numbering, input hardening | built, each feature verified live in a real browser session (see `the project's own tracker`) |

**Time to a downloaded invoice for a returning user: ~2.5–3.3s** (5 runs,
`e2e/measure-time-to-invoice.ts`; well inside the 10-second target). Measured
end to end against the production build — service worker warm, unlocking an
encrypted draft with a passphrase, loading a saved seller profile, filling
the buyer and one line, and downloading a PDF/A-3 invoice that passes
`tools/validate.py`. Includes real automation overhead, not a best-case
number picked after the fact.

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

To run the app locally:

    npm run schematron:compile   # compiles the validator's Schematron to SEF (gitignored, not committed)
    npm run saxonjs:fetch        # fetches the free SaxonJS browser runtime (gitignored, not committed)
    npm run dev --workspace=packages/ui

The end-to-end gate (creates a real invoice through the UI, asserts the
downloaded PDF passes `tools/validate.py`) needs a Playwright browser once:

    npx playwright install --with-deps chromium
    npm run e2e

## Reading

- `CONTRIBUTING.md` is the contract for this repo. Read it before changing anything.
- `docs/pdf-traps.md` is why Factur-X generation usually fails silently.

## License

Apache-2.0.
