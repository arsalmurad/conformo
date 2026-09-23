import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

describe('validator-page: builds a standalone, separately deployable bundle', () => {
  it('npm run build produces an index.html and the validator assets it fetches at runtime', () => {
    // A single fixed, non-user-controlled command string — needs the shell
    // on Windows to resolve npm's own .cmd launcher, and there is nothing
    // here for a shell to unsafely interpolate.
    execSync('npm run build --workspace=packages/validator-page', { stdio: 'pipe' });

    expect(fs.existsSync('packages/validator-page/dist/index.html')).toBe(true);
    // The three assets browserValidator.ts fetches at runtime — a build that
    // silently forgot to copy them would still "succeed" but fail at first use.
    for (const f of ['SaxonJS2.rt.js', 'en16931.sef.json', 'fr-ctc.sef.json']) {
      expect(fs.existsSync(`packages/validator-page/dist/validator/${f}`)).toBe(true);
    }
  }, 30_000);
});
