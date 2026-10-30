import { serve } from '@hono/node-server';
import type { AppOptions } from './app.js';
import { createApp } from './app.js';

export interface StartOptions extends AppOptions {
  /** Default 8788; 0 picks a free port. */
  port?: number;
  /** Default 127.0.0.1. The server has no authentication: do not bind a public interface without a TLS+auth proxy in front. */
  host?: string;
}

export interface RunningServer { url: string; host: string; port: number; close(): Promise<void> }

export async function start(options: StartOptions = {}): Promise<RunningServer> {
  const host = options.host ?? '127.0.0.1';
  const app = createApp(options);
  return new Promise<RunningServer>((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: options.port ?? 8788, hostname: host }, (info) => {
      const shown = host.includes(':') ? `[${host}]` : host;
      resolve({
        host, port: info.port, url: `http://${shown}:${info.port}`,
        close: () => new Promise<void>((res, rej) => { server.close((e) => (e ? rej(e) : res())); (server as { closeAllConnections?: () => void }).closeAllConnections?.(); }),
      });
    });
    server.once('error', reject);
  });
}
