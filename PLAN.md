# Conformo v0.2 plan

Strict priority: P0 fully verified before P1, P1 before P2. `[x]` = proven by a test or generated report; `[~]` = partly, see the note; `[ ]` = not done.

## Step 0
- [x] Install, run every gate, record baseline in PROGRESS.md

## P0
- [x] P0.1 `checkInvoice()` + `InvoiceInputError`; serializers call it; README example fixed (test/check-invoice.test.ts, README doctest)
- [x] P0.2 Runtime validation for all generated formats, one code path
  - [x] pinned artefact manifest + idempotent offline-cacheable fetcher
  - [x] EN 16931 CII/UBL, XRechnung CII/UBL, Peppol BIS 3.0, FR CTC
  - [~] XSD in Node yes; in the browser no (KNOWN-GAPS)
  - [x] auto-detect syntax/profile; result lists the rule sets that ran
- [x] P0.3 Reproducible builds (requirements.txt, manifest pins, CI uses them) - [~] Windows not executed (KNOWN-GAPS)
- [x] P0.4 Conformance vs official corpora -> docs/CONFORMANCE.md + CI step - [~] no official ZUGFeRD/Factur-X PDF samples (unreachable)
- [x] P0.5 Germany 2027 path (profiles, Leitweg-ID, SEPA DD, BG-24, guide executed by a test)
- [x] P0.6 Model completeness + generated docs/EN16931-COVERAGE.md with drift test
- [x] P0.7 Package hygiene + pack smoke + doc-tests
- [x] P0.8 README rewrite + matrix generator

## P1
- [x] P1.1 CLI
- [x] P1.2 MCP server (stdio + Streamable HTTP, SDK-client tests on both) - [~] not run on Windows
- [x] P1.3 `@conformo/server` + OpenAPI 3.1 - [~] Dockerfile never built (no daemon)
- [~] P1.4 Validator page + web app updated and typechecked; browser run and e2e not executed in the build sandbox
- [x] P1.5 Examples with tests
- [x] P1.6 docs/COMPARISON.md (unverifiable cells say so)
- [~] P1.7 Dataset refresh: structure and PL/BE/FR changes done, new facts marked unverified; primary sources unreachable

## P2
- [~] P2.1 KSeF FA(3): generation (domestic PLN) + XSD validation; no reader
- [ ] P2.2 FatturaPA: official schema not obtainable from a reachable primary source
- [x] P2.3 Property and fuzz tests
- [~] P2.4 Size budgets in CI, rule sets lazy-loaded per profile and shipped gzipped

## Finish
- [x] 0.2.0 bump + CHANGELOG.md, RELEASE.md
- [x] docs/FINAL-REPORT.md and terminal summary
