#!/usr/bin/env node
// Same pattern as packages/ui/scripts/copy-validator-assets.mjs — this page
// is deliberately a separate, separately-deployable unit, so it copies its
// own assets rather than depending on packages/ui's public/ directory at
// build time.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const destDir = fileURLToPath(new URL('../public/validator', import.meta.url));

const files = [
  [`${repoRoot}/packages/validate/artefacts/en16931-cii.sef.json.gz`, 'en16931-cii.sef.json'],
  [`${repoRoot}/packages/validate/artefacts/en16931-ubl.sef.json.gz`, 'en16931-ubl.sef.json'],
  [`${repoRoot}/packages/validate/artefacts/xrechnung-cii.sef.json.gz`, 'xrechnung-cii.sef.json'],
  [`${repoRoot}/packages/validate/artefacts/xrechnung-ubl.sef.json.gz`, 'xrechnung-ubl.sef.json'],
  [`${repoRoot}/packages/validate/artefacts/peppol-ubl.sef.json.gz`, 'peppol-ubl.sef.json'],
  [`${repoRoot}/packages/validate/artefacts/fr-ctc.sef.json.gz`, 'fr-ctc.sef.json'],
  [`${repoRoot}/packages/validate/artefacts/rulesets.json`, 'rulesets.json'],
  [`${repoRoot}/tools/artefacts/saxonjs-runtime/saxon-js/SaxonJS2.rt.js`, 'SaxonJS2.rt.js'],
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
for (const [src, name] of files) {
  // Rule sets ship gzipped in the npm package; pages get them as plain static JSON (hosts compress on the wire).
  if (src.endsWith('.gz')) writeFileSync(`${destDir}/${name}`, gunzipSync(readFileSync(src)));
  else copyFileSync(src, `${destDir}/${name}`);
}
// The page shares the app's typeface (packages/ui/src/index.css loads it from /assets/fonts): self-hosted, no font CDN.
const fontDir = fileURLToPath(new URL('../public/assets/fonts', import.meta.url));
mkdirSync(fontDir, { recursive: true });
for (const f of ['WorkSans-Regular.ttf', 'WorkSans-Bold.ttf']) copyFileSync(`${repoRoot}/packages/ui/public/assets/fonts/${f}`, `${fontDir}/${f}`);
console.log(`copied ${files.length} validator assets into public/validator/ and the fonts into public/assets/fonts/`);
