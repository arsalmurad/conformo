// Runs tools/pdfa_audit.py on the hybrid PDF of every profile that tools/build-sample.ts wrote (out/pdf-profiles.json).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(here, '../out/pdf-profiles.json'), 'utf-8'));
let failed = false;
for (const [profile, m] of Object.entries(manifest)) {
  console.log(`\n=== PDF/A audit: profile ${profile} (${m.file}, ${m.xml}, fx:ConformanceLevel ${m.level}) ===`);
  const r = spawnSync(process.execPath, [path.join(here, 'py.mjs'), path.join(here, 'pdfa_audit.py'), m.file, m.xml, m.level], { stdio: 'inherit', cwd: path.join(here, '..') });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
