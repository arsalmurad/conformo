#!/usr/bin/env node
// Writes a minimal {country, name} list to public/compliance-countries.json
// from packages/compliance-data's own source files — not its gitignored
// dist/compliance-data.json build artefact, so this needs no separate build
// step and can never go stale relative to the country data itself. Read at
// runtime so the country selector is driven from the dataset: adding a
// country to the data adds it to the app, rather than the selector
// silently lagging behind what packages/compliance-data actually ships.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dataDir = fileURLToPath(new URL('../../compliance-data/src/data', import.meta.url));
const destDir = fileURLToPath(new URL('../public', import.meta.url));

const countries = readdirSync(dataDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const { country, name } = JSON.parse(readFileSync(`${dataDir}/${f}`, 'utf-8'));
    return { country, name };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(destDir, { recursive: true });
writeFileSync(`${destDir}/compliance-countries.json`, JSON.stringify(countries));
console.log(`wrote public/compliance-countries.json (${countries.length} countries)`);
