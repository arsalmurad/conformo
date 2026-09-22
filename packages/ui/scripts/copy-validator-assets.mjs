#!/usr/bin/env node
// Copies the validator's gitignored build artefacts (compiled Schematron SEF,
// the SaxonJS browser runtime) into public/validator/ so Vite serves them as
// static assets the browser can fetch at runtime — see
// src/validation/browserValidator.ts. Run before dev/build; fails loudly if
// the source artefacts don't exist yet, rather than shipping an app whose
// live validation silently 404s.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const destDir = fileURLToPath(new URL('../public/validator', import.meta.url));

const files = [
  [`${repoRoot}/packages/validate/artefacts/en16931.sef.json`, 'en16931.sef.json'],
  [`${repoRoot}/packages/validate/artefacts/fr-ctc.sef.json`, 'fr-ctc.sef.json'],
  [`${repoRoot}/tools/artefacts/saxon-js/SaxonJS2.rt.js`, 'SaxonJS2.rt.js'],
];

mkdirSync(destDir, { recursive: true });
const missing = files.filter(([src]) => !existsSync(src));
if (missing.length > 0) {
  console.error('Missing validator build artefacts — run these first:');
  console.error('  npm run schematron:compile');
  console.error('  npm run saxonjs:fetch');
  console.error('Missing:', missing.map(([src]) => src).join(', '));
  process.exit(1);
}
for (const [src, name] of files) copyFileSync(src, `${destDir}/${name}`);
console.log(`copied ${files.length} validator assets into public/validator/`);
