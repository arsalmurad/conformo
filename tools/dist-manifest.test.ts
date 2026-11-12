// Trusted publishing (npm OIDC) requires repository.url in the published package.json to match the GitHub repository exactly.
// The manifest that is published is the one tools/write-dist-manifest.mjs writes into dist/, so run the writer and check that.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const PUBLISHED = ['core', 'formats', 'pdf', 'parse', 'compliance-data', 'validate', 'schema', 'toolkit', 'cli', 'mcp-server', 'server'];
const URL = 'git+https://github.com/arsalmurad/conformo.git';

describe('published manifests name the GitHub repository (npm trusted publishing)', () => {
  for (const name of PUBLISHED) {
    it(`@conformo/${name}`, () => {
      // Work on a copy so the real dist/ is untouched. The writer needs <pkg>/package.json, ../../LICENSE and a dist/ folder.
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-manifest-'));
      try {
        const pkgDir = path.join(tmp, 'packages', name);
        fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true });
        fs.copyFileSync(path.join(root, 'packages', name, 'package.json'), path.join(pkgDir, 'package.json'));
        fs.copyFileSync(path.join(root, 'LICENSE'), path.join(tmp, 'LICENSE'));
        execFileSync(process.execPath, [path.join(root, 'tools', 'write-dist-manifest.mjs'), pkgDir], { stdio: 'pipe' });
        const published = JSON.parse(fs.readFileSync(path.join(pkgDir, 'dist', 'package.json'), 'utf8'));
        expect(published.repository).toEqual({ type: 'git', url: URL, directory: `packages/${name}` });
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
