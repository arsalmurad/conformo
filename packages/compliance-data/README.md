# @conformo/compliance-data

A sourced dataset of e-invoicing mandates per country (issuing and receiving, dates, thresholds, formats). Every fact has a source URL or is marked `unverified`.

```js
import assert from 'node:assert/strict';
import { getCountry } from '@conformo/compliance-data';

const de = getCountry('DE');
assert.ok(de.mandates.some((m) => m.direction === 'receive' && m.effectiveDate === '2025-01-01'));
```
