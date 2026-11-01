#!/usr/bin/env node
// Pack smoke test: the package a user installs is not the workspace you develop in. This builds every public package,
// `npm pack`s it, installs the tarballs into a fresh temporary project and runs every code block in README.md, docs/*.md and the
// package READMEs against the installed copies. If a quickstart breaks, or a package forgets to ship a file it needs, this fails.
//
// Usage: node tools/pack-smoke.mjs [--keep]      (needs network for third-party dependencies from the npm registry)
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
};

const pkgs = readdirSync(path.join(root, 'packages'))
  .map((d) => ({ dir: d, json: JSON.parse(readFileSync(path.join(root, 'packages', d, 'package.json'), 'utf-8')) }))
  .filter((p) => !p.json.private);
// Build dependencies first: each package compiles against its dependencies' emitted .d.ts (tsconfig.build.base.json).
const byName = new Map(pkgs.map((p) => [p.json.name, p]));
const ordered = [];
const visit = (p) => {
  if (ordered.includes(p)) return;
  for (const d of Object.keys(p.json.dependencies ?? {})) if (byName.has(d)) visit(byName.get(d));
  ordered.push(p);
};
pkgs.forEach(visit);
pkgs.splice(0, pkgs.length, ...ordered);
console.log(`public packages: ${pkgs.map((p) => p.json.name).join(', ')}`);

const work = mkdtempSync(path.join(tmpdir(), 'conformo-pack-'));
const tarballs = {};
for (const p of pkgs) {
  console.log(`build + pack ${p.json.name}`);
  sh(npm, ['run', 'build', `--workspace=packages/${p.dir}`], { cwd: root });
  // `npm publish` normalizes the manifest and silently drops what it considers invalid (a "./"-prefixed bin lost the
  // `conformo` command this way); `npm pack` does not, so the install below would never notice. `npm pkg fix` applies
  // the same normalization locally: the generated manifest must already be in its fixed form.
  const manifest = readFileSync(path.join(root, 'packages', p.dir, 'dist', 'package.json'), 'utf-8');
  const fixDir = mkdtempSync(path.join(work, 'pkgfix-'));
  writeFileSync(path.join(fixDir, 'package.json'), manifest);
  sh(npm, ['pkg', 'fix'], { cwd: fixDir });
  const fixed = readFileSync(path.join(fixDir, 'package.json'), 'utf-8');
  if (JSON.stringify(JSON.parse(fixed)) !== JSON.stringify(JSON.parse(manifest))) {
    throw new Error(`${p.json.name}: npm would rewrite dist/package.json on publish (fix tools/write-dist-manifest.mjs)\n--- generated\n${manifest}\n--- npm pkg fix\n${fixed}`);
  }
  const out = sh(npm, ['pack', '--pack-destination', work, '--json'], { cwd: path.join(root, 'packages', p.dir, 'dist') });
  tarballs[p.json.name] = path.join(work, JSON.parse(out)[0].filename);
}

const proj = path.join(work, 'project');
mkdirSync(proj);
writeFileSync(path.join(proj, 'package.json'), JSON.stringify({
  name: 'conformo-smoke', private: true, type: 'module',
  dependencies: Object.fromEntries(Object.entries(tarballs).map(([n, t]) => [n, `file:${t}`])),
  overrides: Object.fromEntries(Object.entries(tarballs).map(([n, t]) => [n, `file:${t}`])),
}, null, 2));
console.log('npm install of the tarballs into a fresh project');
sh(npm, ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: proj });

const docs = ['README.md', ...readdirSync(path.join(root, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...readdirSync(path.join(root, 'docs', 'site')).filter((f) => f.endsWith('.md')).map((f) => `docs/site/${f}`),
  ...pkgs.map((p) => `packages/${p.dir}/README.md`)].filter((f) => existsSync(path.join(root, f))).map((f) => path.join(root, f));
let failed = false;
const r = spawnSync(process.execPath, [path.join(root, 'tools/doctest.mjs'), '--cwd', proj, ...docs], { encoding: 'utf-8', stdio: 'inherit' });
if (r.status !== 0) failed = true;

// The installed binaries start.
const bin = (n) => path.join(proj, 'node_modules', '.bin', process.platform === 'win32' ? `${n}.cmd` : n);
for (const [n, args] of [['conformo', ['--version']], ['conformo', ['requirements', 'DE', '--json']]]) {
  if (!existsSync(bin(n))) { console.error(`FAIL bin ${n} missing`); failed = true; continue; }
  const b = spawnSync(bin(n), args, { encoding: 'utf-8', shell: process.platform === 'win32' });
  if (b.status !== 0) { console.error(`FAIL ${n} ${args.join(' ')}\n${b.stderr}`); failed = true; } else console.log(`ok   ${n} ${args.join(' ')}`);
}
if (!process.argv.includes('--keep')) rmSync(work, { recursive: true, force: true });
else console.log('kept', work);
process.exit(failed ? 1 : 0);
