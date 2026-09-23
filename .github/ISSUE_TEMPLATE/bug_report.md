---
name: Bug report
about: Something in the core, a format, the validator, the app, or parsing is wrong
title: ""
labels: bug
---

**What happened**

**What you expected**

**Which package** (`core`, `formats`, `pdf`, `validate`, `parse`, `cli`, `ui`, `compliance-data`)

**Minimal reproduction**
If this is a wrong invoice, attach the smallest fixture (JSON `Invoice` or
generated XML) that reproduces it. Redact real names, VAT numbers, IBANs and
bank details — this repo is public and synthetic-data-only (`CONTRIBUTING.md`).

**If this is a validation/Schematron result**
Which rule ID (e.g. `BR-CO-15`)? Paste the exact message.

**Environment**
- Node version:
- OS:
- Package version / commit:
