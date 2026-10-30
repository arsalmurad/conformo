# @conformo/pdf

PDF/A-3b hybrid invoices (Factur-X / ZUGFeRD) on pdf-lib, no headless browser. Most callers want `@conformo/toolkit`'s `createPdf`, which wires fonts, XML and metadata for you.

```js
import assert from 'node:assert/strict';
import { FACTURX_PROFILES } from '@conformo/pdf';

assert.equal(FACTURX_PROFILES.xrechnung.xmlFilename, 'xrechnung.xml');
assert.equal(FACTURX_PROFILES.en16931.conformanceLevel, 'EN 16931');
```

MINIMUM and BASIC WL are deliberately not offered: they are not EN 16931 invoices and not accepted for German B2B from 2027.
