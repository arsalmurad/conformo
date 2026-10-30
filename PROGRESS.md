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
