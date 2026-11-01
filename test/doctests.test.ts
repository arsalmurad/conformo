import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = [
  'README.md',
  ...readdirSync(path.join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...readdirSync(path.join(root, 'packages')).map((p) => `packages/${p}/README.md`),
].filter((f) => existsSync(path.join(root, f)));

// Every runnable (```js) block in the README, the docs and the package READMEs is executed; JSON blocks must parse.
// The same runner is used by tools/pack-smoke.mjs against the packed tarballs.
describe('documentation code runs', () => {
  for (const f of docs) {
    it(f, () => {
      const r = spawnSync(process.execPath, [path.join(root, 'tools/doctest.mjs'), '--tsx', '--cwd', root, f], { encoding: 'utf-8' });
      expect(r.status, r.stdout + r.stderr).toBe(0);
    }, 240000);
  }
});
