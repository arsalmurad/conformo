import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './createServer.js';
import { SERVER_VERSION } from './version.js';

export const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface HttpOptions {
  port?: number;
  host?: string;
  maxBodyBytes?: number;
}

export interface RunningHttpServer {
  server: Server;
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

const rpcError = (res: ServerResponse, status: number, code: number, message: string, headers: Record<string, string> = {}): void => {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
};

class BodyTooLarge extends Error {}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) return reject(new BodyTooLarge());
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) { chunks.length = 0; reject(new BodyTooLarge()); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const hostnameOf = (hostHeader: string): string => (hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0] ?? '');

/**
 * Stateless Streamable HTTP: a new McpServer and transport per request (no session ids, nothing kept between calls),
 * JSON responses. POST /mcp is the endpoint; GET/DELETE /mcp answer 405; GET /healthz is a liveness probe. There is no
 * authentication: put a reverse proxy in front of anything that is not loopback.
 */
export async function startHttpServer(options: HttpOptions = {}): Promise<RunningHttpServer> {
  const host = options.host ?? '127.0.0.1';
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const loopbackOnly = LOOPBACK.has(host);

  const server = createServer((req, res) => {
    void handle(req, res).catch((err: unknown) => {
      console.error('conformo-mcp: request failed:', err instanceof Error ? err.message : err);
      rpcError(res, 500, -32603, 'Internal server error');
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // DNS-rebinding guard: a loopback-bound server only answers requests addressed to a loopback name.
    if (loopbackOnly && !LOOPBACK.has(hostnameOf(req.headers.host ?? ''))) return rpcError(res, 403, -32000, 'Forbidden: unexpected Host header');
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (pathname === '/healthz') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return rpcError(res, 405, -32000, 'Method not allowed', { allow: 'GET, HEAD' });
      res.writeHead(200, { 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ status: 'ok', name: 'conformo', version: SERVER_VERSION }));
    }
    if (pathname !== '/mcp') return rpcError(res, 404, -32000, 'Not found. The MCP endpoint is POST /mcp.');
    if (req.method !== 'POST') {
      return rpcError(res, 405, -32000, 'Method not allowed. This server is stateless: use POST /mcp (no GET stream, no sessions to delete).', { allow: 'POST' });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(req, maxBody));
    } catch (err) {
      if (err instanceof BodyTooLarge) {
        res.once('finish', () => req.destroy());
        return rpcError(res, 413, -32000, `Request body exceeds the ${maxBody}-byte limit.`, { connection: 'close' });
      }
      return rpcError(res, 400, -32700, 'Parse error: body is not valid JSON');
    }

    const mcp = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void mcp.close(); });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, parsed);
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 8787, host, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const shown = host.includes(':') ? `[${host}]` : host;
  return {
    server, host, port, url: `http://${shown}:${port}/mcp`,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }),
  };
}
