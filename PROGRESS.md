# Progress log

## Step 0: baseline (2026-10-30, branch `upgrade/v0.2` from 2130e4b, Linux sandbox, Node 22.22.0, Python 3.13, Java present)

Environment note: this sandbox's egress policy blocks `downloads.saxonica.com`, `codeberg.org`, `api.github.com`,
github.com HTML pages, and all ministry/EU/FeRD sites. `git clone` of public GitHub repos, `raw.githubusercontent.com`,
GitHub release-asset URLs, Maven Central, npm and PyPI work. See docs/KNOWN-GAPS.md.

| Gate | Result |
|---|---|
| `npm install` | ok |
| `pip install factur-x==6.8 pikepdf lxml saxonche` | ok (factur-x 6.8, saxonche 13.1.1, pikepdf 10.17) |
| `npm run typecheck` | pass |
| `npm run schematron:compile` | pass with factur-x 6.8. en16931.sef.json = 191 KB gzipped (docs say 141 KB), fr-ctc.sef.json = 76 KB gz |
| `npm run saxonjs:fetch` | FAIL here: `downloads.saxonica.com` blocked (HTTP 403 on CONNECT) |
| `npm test` | 167 passed, 3 skipped (validate-browser needs SaxonJS runtime), 1 failed (`validator-page-build`: needs SaxonJS2.rt.js) |
| `npm run build:sample` | pass |
| `npm run validate` (tools/validate.py) | FAIL here: SchXslt2 zip from `codeberg.org` blocked |
| pdfa audit (`tools/pdfa_audit.py`) | pass ("PDF/A-3b STRUCTURAL AUDIT: PASS") |
| `npm run e2e` | FAIL here: web server build needs SaxonJS2.rt.js |
| `npm run build:compliance-data && npm run docs:build` | pass (9 pages) |

All three failures have the same cause (blocked download hosts), not code defects.

## Log (what was done, in order; details in git history and docs/DECISIONS.md)

1. Artefact pipeline: `tools/artefacts.manifest.json` (version + SHA-256/commit pins), `tools/fetch-artefacts.mjs` (idempotent, cached), `tools/build-rulesets.mjs` (pure Node). A first SchXslt2 hash I recorded was a rate-limit page; the fetcher's check caught it, then it was pinned against Maven's own checksum.
2. Validation engine: auto-detected CII/UBL/XRechnung/Peppol/FR rule sets + XSD, one code path for Node and browser; EN 16931 rules from CEN validation-1.3.17; KoSIT severity table applied and reported.
3. Model completeness (all BT/BG), `checkInvoice`, typed errors, exact sub-cent prices; generated EN 16931 coverage doc.
4. Conformance harness against Saxon-HE, lxml, the KoSIT validator and CEN unit-test expectations. It found and led to fixes for: wrong XRechnung BT-24 URN, BT-8 code lists, BR-DE-14, empty delivery address, TaxPointDate repetition, proprietary account ids, department names, stated VAT/line amounts.
5. Germany path: ZUGFeRD profiles (EN 16931, XRECHNUNG, EXTENDED), executed guide.
6. Toolkit, CLI, MCP (schema package), HTTP API, examples (the last three built with subagents; I re-ran and reviewed their tests).
7. Pack smoke test + doc-tests; found stale `dist/` shipping 23 MB, fixed by cleaning before builds.
8. README rewrite, dataset refresh (new facts marked unverified), comparison page (licences spot-checked against the cloned LICENSE files).
9. P2: property/fuzz tests, size budgets, KSeF FA(3) generation + XSD from the Ministry's own repository. FatturaPA not possible (no reachable primary schema).

Gate results are in docs/FINAL-REPORT.md.
