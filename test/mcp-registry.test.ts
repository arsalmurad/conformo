// packages/mcp-server/server.json is what the official MCP Registry lists. The registry rejects a publish whose npm package
// does not carry the same name in "mcpName", and a listing whose version is not on npm points users at nothing. These checks
// keep the two files in step so a release cannot forget one of them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

const root = process.cwd();
const pkgDir = path.join(root, 'packages', 'mcp-server');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as { name: string; version: string; mcpName?: string };
const server = JSON.parse(fs.readFileSync(path.join(pkgDir, 'server.json'), 'utf8')) as {
  name: string;
  description: string;
  title?: string;
  version: string;
  packages: { registryType: string; identifier: string; version: string; transport: { type: string } }[];
};

describe('MCP Registry metadata', () => {
  it('server.json names the npm package and its current version', () => {
    expect(pkg.mcpName).toBe(server.name);
    expect(server.name).toMatch(/^io\.github\.arsalmurad\/[a-zA-Z0-9._-]+$/);
    expect(server.version).toBe(pkg.version);
    expect(server.packages).toHaveLength(1);
    const npm = server.packages[0]!;
    expect(npm.registryType).toBe('npm');
    expect(npm.identifier).toBe(pkg.name);
    expect(npm.version).toBe(pkg.version);
    expect(npm.transport.type).toBe('stdio');
  });

  it('stays inside the registry schema limits', () => {
    expect(server.description.length).toBeGreaterThan(0);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect((server.title ?? 'x').length).toBeLessThanOrEqual(100);
  });

  it('the published manifest carries mcpName', () => {
    // Run the real manifest generator on a throwaway copy of the package so dist/ in the workspace is not touched.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conformo-mcpname-'));
    try {
      const copy = path.join(tmp, 'packages', 'mcp-server');
      fs.mkdirSync(path.join(copy, 'dist'), { recursive: true });
      fs.copyFileSync(path.join(pkgDir, 'package.json'), path.join(copy, 'package.json'));
      fs.copyFileSync(path.join(root, 'LICENSE'), path.join(tmp, 'LICENSE'));
      for (const dep of ['schema', 'toolkit']) {
        fs.mkdirSync(path.join(tmp, 'packages', dep));
        fs.copyFileSync(path.join(root, 'packages', dep, 'package.json'), path.join(tmp, 'packages', dep, 'package.json'));
      }
      const r = spawnSync(process.execPath, [path.join(root, 'tools', 'write-dist-manifest.mjs'), copy], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'dist', 'package.json'), 'utf8')) as { mcpName?: string; version: string };
      expect(manifest.mcpName).toBe(server.name);
      expect(manifest.version).toBe(server.version);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
