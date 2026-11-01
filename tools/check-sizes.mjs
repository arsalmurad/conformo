#!/usr/bin/env node
// Reports the size of the compiled validation artefacts and fails when a budget in tools/size-budget.json is exceeded.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const budget = JSON.parse(readFileSync(path.join(root, 'tools/size-budget.json'), 'utf-8'));
const art = path.join(root, 'packages/validate/artefacts');
const sets = JSON.parse(readFileSync(path.join(art, 'rulesets.json'), 'utf-8')).rulesets;
let failed = false;
const row = (name, kb, max) => {
  const ok = kb <= max;
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'OVER'} ${name.padEnd(34)} ${kb.toFixed(0).padStart(5)} KB / budget ${max} KB`);
};
for (const [id, max] of Object.entries(budget.rulesetGzipKB)) row(`${id} (gzip)`, sets[id].gzipBytes / 1024, max);
const t = budget.typicalBrowserDownloadGzipKB;
row(`browser: ${t.ids.join(' + ')} (gzip)`, t.ids.reduce((n, id) => n + sets[id].gzipBytes, 0) / 1024, t.max);
const dirSize = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? dirSize(path.join(d, e.name)) : statSync(path.join(d, e.name)).size), 0);
row("validate/artefacts unpacked (KB)", dirSize(art) / 1024, budget.validatePackageArtefactsMB * 1024);
process.exit(failed ? 1 : 0);
