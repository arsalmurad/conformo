# Conformo v0.2 plan

Strict priority: P0 fully verified before P1, P1 before P2. Tick items only when a test or generated report proves them.

## Step 0
- [x] Install, run every gate, record baseline in PROGRESS.md

## P0
- [ ] P0.1 `checkInvoice()` + `InvoiceInputError`; serializers call it; README example fixed
- [ ] P0.2 Runtime validation for all generated formats, one code path (Node + browser)
  - [ ] pinned artefact manifest (`tools/artefacts.manifest.json`) + idempotent offline-cacheable fetcher
  - [ ] EN 16931 CII, EN 16931 UBL (Invoice + CreditNote), XRechnung CII/UBL, Peppol BIS 3.0, FR CTC
  - [ ] XSD validation in Node (browser limitation in KNOWN-GAPS)
  - [ ] auto-detect syntax/profile (root + BT-24); `validate(xml,{country?,profile?})` reports rule sets that ran
- [ ] P0.3 Reproducible builds (`tools/requirements.txt`, pinned artefacts, CI uses them)
- [ ] P0.4 Conformance vs official corpora -> generated `docs/CONFORMANCE.md` + CI step
- [ ] P0.5 Germany 2027 path (ZUGFeRD EN16931/EXTENDED/XRECHNUNG, Leitweg-ID, SEPA DD, BG-24, guide executed by a test)
- [ ] P0.6 Model completeness (every BT/BG) + generated `docs/EN16931-COVERAGE.md` with drift check
- [ ] P0.7 Package hygiene + pack smoke test + doc-tests
- [ ] P0.8 README rewrite + compliance matrix generator fix

## P1
- [ ] P1.1 CLI create / convert / validate / parse / explain / requirements
- [ ] P1.2 MCP server rebuilt (schema'd inputs, 7 tools, stdio + Streamable HTTP, SDK-client tests, docs)
- [ ] P1.3 `@conformo/server` HTTP API + OpenAPI 3.1 + Dockerfile
- [ ] P1.4 Validator page + web app: all syntaxes, rule sets shown, Germany 2027 profile
- [ ] P1.5 Examples (Stripe, Shopify, Hono/Express, agent) with tests
- [ ] P1.6 docs/COMPARISON.md (only verifiable claims)
- [ ] P1.7 Compliance dataset refresh (primary sources only, else `unverified`)

## P2
- [ ] P2.1 KSeF FA(3)  - [ ] P2.2 FatturaPA  - [ ] P2.3 property/fuzz tests  - [ ] P2.4 bundle size budgets

## Finish
- [ ] 0.2.0 bump + CHANGELOG.md, RELEASE.md, docs/FINAL-REPORT.md, terminal summary
