#!/usr/bin/env node
// Executes the code in the documentation, so a quickstart that stops working fails a test.
//
//   js / mjs fences   are run (ESM, top-level await). All js fences of one file share one module, in order, so a guide can
//                     build on its earlier steps. Add `no-run` to the fence info (```js no-run) to skip one.
//   json fences       must parse as JSON (copy-paste MCP configs, request bodies).
//   everything else   (bash, ts, text) is shown, not run.
//
// Usage: node tools/doctest.mjs [--cwd <dir>] [--tsx] <file.md>...
//   --cwd  directory whose node_modules the imports resolve against (the pack smoke test passes a fresh temp project)
//   --tsx  load the TypeScript sources of this monorepo through tsx (workspace mode); without it, plain node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return undefined; return args.splice(i, 2)[1]; };
const cwd = path.resolve(take('--cwd') ?? process.cwd());
const tsx = args.includes('--tsx');
const files = args.filter((a) => a !== '--tsx');

export function extractBlocks(md) {
  const blocks = [];
  const re = /^```([^\n]*)\n([\s\S]*?)^```/gm;
  let m;
  while ((m = re.exec(md))) {
    const info = m[1].trim().split(/\s+/);
    blocks.push({ lang: info[0] ?? '', flags: info.slice(1), code: m[2], line: md.slice(0, m.index).split('\n').length + 1 });
  }
  return blocks;
}

let failed = 0;
const tmp = path.join(cwd, '.doctest');
mkdirSync(tmp, { recursive: true });
for (const file of files) {
  const md = readFileSync(file, 'utf-8');
  const blocks = extractBlocks(md);
  for (const b of blocks.filter((x) => x.lang === 'json' && !x.flags.includes('no-run'))) {
    try { JSON.parse(b.code); } catch (e) { failed++; console.error(`FAIL ${file}:${b.line} json block does not parse: ${e.message}`); }
  }
  const runnable = blocks.filter((b) => ['js', 'mjs'].includes(b.lang) && !b.flags.includes('no-run'));
  if (runnable.length === 0) { console.log(`ok   ${file} (no runnable blocks)`); continue; }
  // Keep a map from generated line numbers back to the markdown, for readable failures.
  let src = '';
  const map = [];
  for (const b of runnable) {
    src += `// ---- ${file}:${b.line}\n`;
    map.push({ at: src.split('\n').length, line: b.line });
    src += b.code + '\n';
  }
  const out = path.join(tmp, `${path.basename(file).replace(/\W+/g, '_')}.mjs`);
  writeFileSync(out, src);
  const nodeArgs = tsx ? ['--import', 'tsx', out] : [out];
  const r = spawnSync(process.execPath, nodeArgs, { cwd, encoding: 'utf-8', timeout: 240000 });
  if (r.status !== 0) {
    failed++;
    console.error(`FAIL ${file}\n${(r.stderr || r.stdout).split('\n').slice(0, 25).join('\n')}`);
  } else console.log(`ok   ${file} (${runnable.length} block${runnable.length === 1 ? '' : 's'})`);
}
rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
