#!/usr/bin/env node
/**
 * conformo-mcp: MCP server for EN 16931 e-invoicing. Default: stdio. `--http` serves stateless Streamable HTTP.
 *
 *   conformo-mcp                                  stdio
 *   conformo-mcp --http --port 8787 [--host 127.0.0.1] [--max-body-bytes 8388608]
 *
 * Env: CONFORMO_MCP_PORT, CONFORMO_MCP_HOST, CONFORMO_MCP_MAX_BODY_BYTES, CONFORMO_MCP_ALLOW_ANY_PATH=1.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './createServer.js';
import { DEFAULT_MAX_BODY_BYTES, startHttpServer } from './http.js';
import { SERVER_VERSION } from './version.js';

const USAGE = `conformo-mcp ${SERVER_VERSION}
Usage: conformo-mcp [--http] [--port N] [--host H] [--max-body-bytes N]
  (no flags)           stdio transport (for Claude Desktop, Claude Code, Cursor)
  --http               stateless Streamable HTTP on POST /mcp (GET /healthz for liveness)
  --port N             default 8787 (0 = pick a free port)
  --host H             default 127.0.0.1. The server has NO authentication: front it with a TLS+auth proxy before exposing it.
  --max-body-bytes N   request body limit, default ${DEFAULT_MAX_BODY_BYTES}
  --version, --help`;

function numberArg(name: string, raw: string | undefined): number {
  const n = Number(raw);
  if (raw === undefined || raw === '' || !Number.isInteger(n) || n < 0) {
    console.error(`conformo-mcp: ${name} needs a non-negative integer`);
    process.exit(2);
  }
  return n;
}

const argv = process.argv.slice(2);
const flag = (n: string): boolean => argv.includes(n);
const value = (n: string): string | undefined => {
  const eq = argv.find((a) => a.startsWith(`${n}=`));
  if (eq) return eq.slice(n.length + 1);
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (flag('--help') || flag('-h')) { console.log(USAGE); process.exit(0); }
if (flag('--version') || flag('-v')) { console.log(SERVER_VERSION); process.exit(0); }

if (flag('--http')) {
  const port = value('--port') ?? process.env.CONFORMO_MCP_PORT ?? '8787';
  const max = value('--max-body-bytes') ?? process.env.CONFORMO_MCP_MAX_BODY_BYTES;
  const running = await startHttpServer({
    port: numberArg('--port', port),
    host: value('--host') ?? process.env.CONFORMO_MCP_HOST ?? '127.0.0.1',
    maxBodyBytes: max === undefined ? DEFAULT_MAX_BODY_BYTES : numberArg('--max-body-bytes', max),
  });
  // stderr, so the line never mixes with protocol output; the e2e test parses it to learn the port.
  console.error(`conformo-mcp ${SERVER_VERSION} listening on ${running.url}`);
  const stop = (): void => { void running.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else {
  await createMcpServer().connect(new StdioServerTransport());
}
