#!/usr/bin/env node
/**
 * conformo-server: stateless HTTP API for EN 16931 e-invoicing.
 *
 *   conformo-server [--port 8788] [--host 127.0.0.1] [--max-body 8388608] [--cors https://app.example,https://other.example]
 *
 * Env: CONFORMO_SERVER_PORT, CONFORMO_SERVER_HOST, CONFORMO_SERVER_MAX_BODY, CONFORMO_SERVER_CORS_ORIGINS.
 */
import { start } from './start.js';
import { DEFAULT_MAX_BODY_BYTES } from './app.js';
import { SERVER_VERSION } from './version.js';

const USAGE = `conformo-server ${SERVER_VERSION}
Usage: conformo-server [--port N] [--host H] [--max-body BYTES] [--cors ORIGINS]
  --port N        default 8788 (0 = pick a free port)
  --host H        default 127.0.0.1. There is NO authentication: put a TLS + auth reverse proxy in front before exposing it.
  --max-body N    request body limit in bytes, default ${DEFAULT_MAX_BODY_BYTES}
  --cors LIST     comma-separated allowed origins ("*" for any); default none (no CORS headers)
  --version, --help`;

const argv = process.argv.slice(2);
const flag = (n: string): boolean => argv.includes(n);
const value = (n: string): string | undefined => {
  const eq = argv.find((a) => a.startsWith(`${n}=`));
  if (eq) return eq.slice(n.length + 1);
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
function numberArg(name: string, raw: string): number {
  const n = Number(raw);
  if (raw === '' || !Number.isInteger(n) || n < 0) { console.error(`conformo-server: ${name} needs a non-negative integer`); process.exit(2); }
  return n;
}

if (flag('--help') || flag('-h')) { console.log(USAGE); process.exit(0); }
if (flag('--version') || flag('-v')) { console.log(SERVER_VERSION); process.exit(0); }

const max = value('--max-body') ?? process.env.CONFORMO_SERVER_MAX_BODY;
const corsRaw = value('--cors');
const running = await start({
  port: numberArg('--port', value('--port') ?? process.env.CONFORMO_SERVER_PORT ?? '8788'),
  host: value('--host') ?? process.env.CONFORMO_SERVER_HOST ?? '127.0.0.1',
  ...(max !== undefined ? { maxBodyBytes: numberArg('--max-body', max) } : {}),
  ...(corsRaw !== undefined ? { cors: corsRaw.split(',').map((x) => x.trim()).filter(Boolean) } : {}),
});
console.error(`conformo-server ${SERVER_VERSION} listening on ${running.url}`);
const stop = (): void => { void running.close().then(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
