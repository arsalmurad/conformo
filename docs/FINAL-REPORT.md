# v0.2 final report

Branch `upgrade/v0.2`. Nothing was pushed, published or deployed. Versions are bumped to 0.2.0 ([CHANGELOG](../CHANGELOG.md)); the release steps are in [RELEASE.md](../RELEASE.md).

## What changed

- **Validation** now covers everything Conformo writes, from one code path: EN 16931 (CII, UBL; CEN release validation-1.3.17), XRechnung 3.0.x (KoSIT, CII and UBL),
  Peppol BIS Billing 3.0, French CTC, and XSD in Node. It auto-detects syntax and profile and reports the rule sets that ran. KoSIT's severity table is applied and shown.
- **Reproducible build**: one manifest pins every third-party artefact; Python requirements are pinned; the rule sets compile in pure Node.
- **Model**: every EN 16931 BT/BG, both serializers, both readers, round-trip proven. `checkInvoice()` and `InvoiceInputError` replace raw TypeErrors.
- **Germany 2027 path**: ZUGFeRD EN 16931, XRECHNUNG and EXTENDED profiles, Leitweg-ID, SEPA direct debit, attachments, an executed guide.
- **Surfaces**: `@conformo/toolkit`, full CLI, rebuilt MCP server (stdio and Streamable HTTP), optional HTTP API with OpenAPI 3.1, web app Germany profile, validator page.
- **Trust tooling**: conformance report against official validators and corpora, pack smoke test, doc-tests, generated coverage doc, property and fuzz tests, size budgets.
- **Also**: KSeF FA(3) generation (domestic PLN) with Ministry of Finance XSD validation; comparison page; examples; dataset refresh.
- **Bugs found by the new tooling** (all fixed, each with a test or in the conformance report): XRechnung BT-24 used an identifier the KoSIT validator does not match;
  BT-8 used the wrong code list in CII; BR-DE-14 for category O; empty delivery address; repeated tax-point date; proprietary account ids and department names on read;
  `dist/` not cleaned between builds (a release would have shipped 23 MB of stale files); a docs example that violated BR-DE-25-b.

## Gate results (run in the build sandbox, Linux, Node 22.22, Python 3.13, Java 17)

| Gate | Result |
|---|---|
| `npm run typecheck` (strict, all workspaces) | 0 errors |
| `npm test` | 389 passed, 4 skipped, 1 failed. The skipped tests and the failure are the browser path (`validate-browser`, `validator-page-build`): they need the SaxonJS runtime from `downloads.saxonica.com`, which the sandbox could not reach. They have **not** run anywhere yet. |
| `npm run build:sample` + `npm run validate` | pass: every fixture in every target format against the official XSD and Schematron, and one hybrid PDF per profile |
| PDF/A audit | pass for the sample and for the EN 16931, XRECHNUNG and EXTENDED PDFs |
| Determinism | same bytes on rebuild (checked in CI config; `test/toolkit.test.ts` asserts it for PDFs) |
| `npm run conformance -- --strict` | reference agreement **1066/1066**; official KoSIT validator agreement **114/114** where it has a scenario; CEN unit-test expectations **907/907**; 3 findings, all explained ([CONFORMANCE.md](CONFORMANCE.md)) |
| `npm run pack:smoke` | pass: 11 packages packed, installed into a fresh project, every README/docs code block executed against them, installed `conformo` binary runs |
| Doc-tests | README, docs and package READMEs executed by [test/doctests.test.ts](../test/doctests.test.ts) |
| e2e (Playwright) | **not run** (needs the SaxonJS runtime) |
| Docker image build (app and `Dockerfile.server`) | **not run** (no Docker daemon) |
| Windows | **not run** |

Conformance per corpus (reference agreement / KoSIT agreement): KoSIT XRechnung test suite 86/86 and 86/86; Peppol BIS 3.0 examples 10/10 (KoSIT has no scenario for Peppol);
CEN examples 63/63 and 28/28; CEN rule unit tests 907/907. Round trip on valid documents: re-validates 131/131, fixed point 130/131, totals identical 129/131 (the two differences are explained).

Sizes: EN 16931 CII rule set 143 KB gzipped (the 0.1.1 docs said 141 KB; the actual was 191 KB); EN 16931 UBL 159; XRechnung CII 56 / UBL 63; Peppol 80; French CTC 76. A browser validating
a German CII invoice downloads about 198 KB gzipped. `@conformo/validate` is 715 KB packed and 1.86 MB unpacked (0.1.1: about 12.5 MB unpacked).

## What is still missing, and why

See [KNOWN-GAPS.md](KNOWN-GAPS.md). In short: no transmission of any kind; no FatturaPA (no reachable primary schema) or Facturae; KSeF is partial; XSD is not available in the browser;
the browser path, e2e, Docker and Windows were never executed in this session; legal sources (BMF, § 27 UStG, ministries, FeRD) could not be re-read, so new dataset facts are marked
unverified and no `lastVerified` date was moved; official ZUGFeRD/Factur-X sample PDFs were not part of the conformance run; EXTENDED-only fields are not modelled; the French CTC rules were not
cross-checked against a second source.

## Facts you can quote, each with its evidence

1. Conformo validates EN 16931 CII and UBL, XRechnung 3.x (both syntaxes), Peppol BIS Billing 3.0 and French CTC rules locally, and says which rule sets ran. Evidence: [test/validate.test.ts](../test/validate.test.ts), [CONFORMANCE.md](CONFORMANCE.md).
2. On 1,066 official sample documents (KoSIT XRechnung test suite, Peppol examples, CEN examples and rule unit tests) its verdicts match a second engine (Saxon-HE on the same publisher XSLT, lxml for XSD) in every case, matches the official KoSIT validator's accept/reject on all 114 documents KoSIT has a scenario for, and fires or stays silent on the right rule in 907 of 907 CEN unit tests. Evidence: [CONFORMANCE.md](CONFORMANCE.md) (regenerated in CI).
3. It generates XRechnung (CII, UBL), UBL, CII, Peppol BIS 3.0 documents and Factur-X/ZUGFeRD PDF/A-3 (EN 16931, XRECHNUNG, EXTENDED profiles; the XRECHNUNG profile embeds `xrechnung.xml`) that pass the official XSDs and Schematron. Evidence: `npm run validate` ([tools/validate.py](../tools/validate.py)), [test/toolkit.test.ts](../test/toolkit.test.ts), [docs/GERMANY-2027.md](GERMANY-2027.md).
4. The model covers every EN 16931 business term and group, each proven by a fixture that survives write, read and re-validation in CII and UBL. Evidence: [EN16931-COVERAGE.md](EN16931-COVERAGE.md), [test/model-roundtrip.test.ts](../test/model-roundtrip.test.ts).
5. Bad input gives one typed error listing every problem with its EN 16931 term, not a stack trace. Evidence: [test/check-invoice.test.ts](../test/check-invoice.test.ts).
6. It runs without a server or an account: library, CLI, MCP server over stdio and Streamable HTTP (7 tools with schemas), and an optional stateless HTTP API with generated OpenAPI. Evidence: [test/mcp-server.test.ts](../test/mcp-server.test.ts) (real SDK client, both transports), [test/server.test.ts](../test/server.test.ts), [test/cli-commands.test.ts](../test/cli-commands.test.ts).
7. Output is deterministic and the PDF path uses no headless browser. Evidence: [test/toolkit.test.ts](../test/toolkit.test.ts), [docs/pdf-traps.md](pdf-traps.md).
8. The published packages install cleanly and the README quickstart runs against the installed tarballs. Evidence: `npm run pack:smoke` ([tools/pack-smoke.mjs](../tools/pack-smoke.mjs)).
9. Every third-party artefact is pinned by version and SHA-256 or commit. Evidence: [tools/artefacts.manifest.json](../tools/artefacts.manifest.json).
10. Not claimed: that any document is legally compliant, that transmission works, or anything about FatturaPA, Facturae, or the legal text of the German obligation (see above).
