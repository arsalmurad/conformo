/**
 * Emits the "plain JSON file" the project's own conventions asks for
 * alongside the npm package: a single file a non-Node consumer (a docs site,
 * a spreadsheet, curl) can fetch without installing anything. Importing
 * @conformo/compliance-data already validates every row (see
 * packages/compliance-data/src/validate.ts), so a bad row fails this build
 * rather than getting published.
 */
import fs from 'node:fs';
import { dataset } from '@conformo/compliance-data';

fs.mkdirSync('packages/compliance-data/dist', { recursive: true });
fs.writeFileSync('packages/compliance-data/dist/compliance-data.json', `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`wrote packages/compliance-data/dist/compliance-data.json (${dataset.countries.length} countries)`);
