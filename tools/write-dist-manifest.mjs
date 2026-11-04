// Writes a self-contained package.json into <pkgDir>/dist, derived from the
// package's real package.json. main/exports/bin there point at ./src/*.ts
// for local dev (tsx/vitest resolve those live, no rebuild needed on every
// edit) — but a published npm package can't ship or run TypeScript source
// directly, and npm's own publishConfig field-overriding (main/exports/bin)
// turned out NOT to apply to `npm pack`'s actual tarball manifest (verified
// empirically: the packed package.json came back byte-identical to the
// source, publishConfig block untouched). This script produces the real
// publishable manifest, and `npm publish` is run from inside dist/ itself
// (dist becomes the package root), so no "files" allowlist or publishConfig
// trick is needed at all.
//
// The compiled output under dist/ deliberately keeps the "src/" path
// segment (tsconfig.build.json's rootDir is the package root, not ./src),
// so dist/ exactly mirrors the source layout one level down — every
// import.meta.url-relative path in the source (packages/validate's
// "../artefacts/", packages/compliance-data's "./data/") then resolves
// correctly with zero source changes, as long as those sibling directories
// are also copied into dist/ (see those two packages' own build scripts).
import fs from 'node:fs';
import path from 'node:path';

const pkgDir = process.argv[2];
if (!pkgDir) throw new Error('usage: write-dist-manifest.mjs <packageDir>');

const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));

function toDist(srcRelPath) {
  return srcRelPath.replace(/\.ts$/, '.js');
}

const manifest = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  author: pkg.author,
  license: pkg.license,
  repository: pkg.repository,
  homepage: pkg.homepage,
  keywords: pkg.keywords,
  type: pkg.type,
};

// The official MCP Registry checks that the npm package names the registry entry it belongs to (packages/mcp-server/server.json).
if (pkg.mcpName) manifest.mcpName = pkg.mcpName;

if (pkg.main) {
  manifest.main = toDist(pkg.main);
  manifest.types = manifest.main.replace(/\.js$/, '.d.ts');
}

if (pkg.exports) {
  manifest.exports = {};
  for (const [key, value] of Object.entries(pkg.exports)) {
    if (typeof value === 'string' && value.endsWith('.ts')) {
      const jsPath = toDist(value);
      manifest.exports[key] = { types: jsPath.replace(/\.js$/, '.d.ts'), default: jsPath };
    } else if (typeof value === 'string') {
      manifest.exports[key] = value.replace(/^\.\/dist\//, './');
    } else {
      manifest.exports[key] = value;
    }
  }
}

if (pkg.bin) {
  manifest.bin = {};
  for (const [cmd, target] of Object.entries(pkg.bin)) {
    // No leading "./": npm 11's publish-time normalization treats "./src/cli.js" as an invalid bin and silently drops it
    // (`npm pack` keeps it, so only a real publish loses the command). "src/cli.js" is the form `npm pkg fix` writes.
    manifest.bin[cmd] = toDist(target).replace(/^\.\//, '');
  }
}

// Internal dependencies always point at the sibling's current version, so a release bumps one number per package.
if (pkg.dependencies) {
  manifest.dependencies = {};
  for (const [name, range] of Object.entries(pkg.dependencies)) {
    const sibling = name.startsWith('@conformo/') ? path.join(pkgDir, '..', name.slice('@conformo/'.length), 'package.json') : undefined;
    manifest.dependencies[name] = sibling && fs.existsSync(sibling) ? `^${JSON.parse(fs.readFileSync(sibling, 'utf8')).version}` : range;
  }
}
manifest.engines = { node: '>=20' };
// Libraries are side-effect free; packages with a bin (cli, mcp-server) run code on import, so they are not marked.
if (!pkg.bin) manifest.sideEffects = false;
manifest.publishConfig = { access: 'public' };

// README and LICENSE travel with every package.
for (const f of ['README.md']) {
  const src = path.join(pkgDir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(pkgDir, 'dist', f));
}
fs.copyFileSync(path.join(pkgDir, '..', '..', 'LICENSE'), path.join(pkgDir, 'dist', 'LICENSE'));
manifest.files = fs.readdirSync(path.join(pkgDir, 'dist')).filter((f) => f !== 'package.json').sort();

fs.writeFileSync(path.join(pkgDir, 'dist', 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${path.join(pkgDir, 'dist', 'package.json')}`);
