# @conformo/core

The EN 16931 invoice model, exact-decimal money and totals, and `checkInvoice()`. Zero runtime dependencies.

```js
import assert from 'node:assert/strict';
import { checkInvoice, totals, InvoiceInputError } from '@conformo/core';

const invoice = {
  number: 'INV-1', issueDate: '2027-01-15', currency: 'EUR',
  seller: { name: 'Seller GmbH', country: 'DE' },
  buyer: { name: 'Buyer GmbH', country: 'DE' },
  lines: [{ name: 'Work', quantity: 1.5, unitPriceMinor: 10000, taxCategory: 'S', taxRate: 19 }],
};
assert.deepEqual(checkInvoice(invoice).filter((i) => i.severity === 'error'), []);
assert.equal(totals(invoice).grand, 17850);          // 150.00 + 19% = 178.50, integer cents, no floats

const problems = checkInvoice({ number: 'X' });       // { path, bt, severity, message } for every problem
assert.ok(problems.some((p) => p.bt === 'BT-2'));
assert.ok(new InvoiceInputError(problems).issues.length > 0);
```

- Every field of `Invoice` names its business term (BT/BG) in its doc comment; `docs/EN16931-COVERAGE.md` lists all of them.
- Money is integer minor units. Unit prices may be fractional minor units (sub-cent prices).
- `checkInvoice` finds input problems; it does not decide compliance. That is the job of `@conformo/validate`.
