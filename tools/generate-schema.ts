/** Writes packages/schema/invoice.schema.json from the zod schema. Run: npm run schema:generate */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { invoiceJsonSchemaText } from '../packages/schema/src/index.ts';

const out = fileURLToPath(new URL('../packages/schema/invoice.schema.json', import.meta.url));
writeFileSync(out, invoiceJsonSchemaText);
console.log(`wrote ${out}`);
