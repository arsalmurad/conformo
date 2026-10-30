/** Writes docs/openapi.json from the generated spec: `npm run openapi:generate`. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openApiText } from './openapi.js';

const out = fileURLToPath(new URL('../../../docs/openapi.json', import.meta.url));
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, openApiText());
console.log(`wrote ${out}`);
