import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PAGES } from '../packages/docs-site/src/pages.js';
import { codeBlocks } from '../packages/docs-site/src/markdown.js';
import { start } from '../packages/server/src/start.js';

/**
 * Every code sample on the docs site is run. `js` blocks are executed by tools/doctest.mjs (test/doctests.test.ts);
 * this test runs the rest, block by block and line by line, in a scratch directory that gets every `json file=...`
 * block written into it first:
 *   npm install <pkg>...               the packages exist in this repo and are public (pack-smoke installs them)
 *   conformo ... / npx conformo ...    the CLI from this checkout; must exit 0
 *   conformo-server --port N           the HTTP API from this checkout (on a free port; curl lines are pointed at it)
 *   curl ...                            -s, -X, -H, -d @file, -o file; must answer 2xx
 *   claude mcp add NAME -- <command>   <command> must start an MCP server that lists Conformo's tools
 *   json with "mcpServers"              each server's command must start the same way
 * Anything else fails the test: a sample nobody can run does not go on the site.
 */
const root = process.cwd();
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const tsxLoader = pathToFileURL(path.join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;
const cliTs = path.join(root, 'packages', 'cli', 'src', 'cli.ts');
const mcpTs = path.join(root, 'packages', 'mcp-server', 'src', 'server.ts');
const workspace = new Map(fs.readdirSync(path.join(root, 'packages')).map((d) => {
  const j = JSON.parse(fs.readFileSync(path.join(root, 'packages', d, 'package.json'), 'utf8')) as { name: string; private?: boolean; bin?: Record<string, string> };
  return [j.name, j] as const;
}));

/** Splits a command line into words, honouring single and double quotes. */
function words(line: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2] ?? m[3]!);
  return out;
}

/** The MCP server a config or `claude mcp add` would start, run from this checkout. Must list Conformo's tools. */
async function checkMcpCommand(command: string, args: string[]) {
  const words = command === 'cmd' ? args.slice(1) : [command, ...args];
  expect(words.slice(0, 3), 'the documented command').toEqual(['npx', '-y', '@conformo/mcp-server']);
  expect(workspace.get('@conformo/mcp-server')?.private).toBeFalsy();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'conformo-docs-mcp-'));
  const client = new Client({ name: 'docs-samples', version: '0.0.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', tsxLoader, mcpTs], cwd,
      env: { ...(process.env as Record<string, string>), TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json') }, stderr: 'pipe' }));
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain('create_invoice');
    expect(tools).toContain('validate_invoice');
  } finally {
    await client.close();
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

async function curl(argv: string[], cwd: string, port: number | undefined) {
  let url = '';
  let method: string | undefined;
  const headers: Record<string, string> = {};
  let body: string | undefined;
  let outFile: string | undefined;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-s') continue;
    else if (a === '-X') method = argv[++i];
    else if (a === '-H') { const [k, ...v] = argv[++i]!.split(':'); headers[k!.trim()] = v.join(':').trim(); }
    else if (a === '-d') { const d = argv[++i]!; body = d.startsWith('@') ? fs.readFileSync(path.join(cwd, d.slice(1)), 'utf8') : d; }
    else if (a === '-o') outFile = argv[++i];
    else if (/^https?:\/\//.test(a)) url = a;
    else throw new Error(`curl option not supported by the sample runner: ${a}`);
  }
  expect(port, 'a curl sample needs `conformo-server` started earlier on the page').toBeDefined();
  const target = url.replace(/^http:\/\/127\.0\.0\.1:\d+/, `http://127.0.0.1:${port}`);
  const res = await fetch(target, { method: method ?? (body ? 'POST' : 'GET'), headers, body });
  const bytes = Buffer.from(await res.arrayBuffer());
  expect(res.status, `${url}: ${bytes.toString('utf8').slice(0, 300)}`).toBeLessThan(300);
  if (outFile) fs.writeFileSync(path.join(cwd, outFile), bytes);
}

describe('every sample on the docs site runs', () => {
  for (const p of PAGES) {
    it(p.src, async () => {
      const blocks = codeBlocks(fs.readFileSync(path.join(root, p.src), 'utf8'));
      for (const b of blocks) expect(['js', 'json', 'bash', ''].includes(b.lang) || b.lang === undefined, `${p.src}: a "${b.lang}" block cannot be run`).toBe(true);
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'conformo-docs-'));
      let server: Awaited<ReturnType<typeof start>> | undefined;
      try {
        for (const b of blocks.filter((x) => x.lang === 'json')) {
          const parsed = JSON.parse(b.code) as { mcpServers?: Record<string, { command: string; args: string[] }> };
          const file = b.flags.find((f) => f.startsWith('file='))?.slice(5);
          if (file) { fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); fs.writeFileSync(path.join(cwd, file), b.code); }
          for (const s of Object.values(parsed.mcpServers ?? {})) await checkMcpCommand(s.command, s.args);
        }
        for (const b of blocks.filter((x) => x.lang === 'bash')) {
          for (const raw of b.code.split('\n')) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;
            const argv = words(line);
            const cmd = argv[0] === 'npx' && argv[1] !== '-y' ? argv.slice(1) : argv;
            if (cmd[0] === 'npm' && cmd[1] === 'install') {
              const pkgs = cmd.slice(2).filter((w) => !w.startsWith('-'));
              expect(pkgs.length).toBeGreaterThan(0);
              for (const name of pkgs) expect(workspace.get(name)?.private, `${name} is a public package of this repository`).toBe(undefined);
              expect(workspace.has(pkgs[0]!)).toBe(true);
            } else if (cmd[0] === 'conformo') {
              const r = spawnSync(process.execPath, [tsxCli, cliTs, ...cmd.slice(1)], { cwd, encoding: 'utf8', timeout: 120_000,
                env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json') } });
              expect(r.status, `${p.src}: ${line}\n${r.stdout}\n${r.stderr}`).toBe(0);
            } else if (cmd[0] === 'conformo-server') {
              expect(workspace.get('@conformo/server')?.bin?.['conformo-server']).toBeDefined();
              server = await start({ port: 0 });
            } else if (cmd[0] === 'curl') {
              await curl(cmd, cwd, server?.port);
            } else if (cmd[0] === 'claude' && cmd[1] === 'mcp' && cmd[2] === 'add') {
              const dd = cmd.indexOf('--');
              expect(dd, 'claude mcp add ... -- <command>').toBeGreaterThan(0);
              await checkMcpCommand(cmd[dd + 1]!, cmd.slice(dd + 2));
            } else {
              throw new Error(`${p.src}: no runner for this sample line, so it cannot be on the site: ${line}`);
            }
          }
        }
      } finally {
        await server?.close();
        fs.rmSync(cwd, { recursive: true, force: true });
      }
    }, 240_000);
  }
});
