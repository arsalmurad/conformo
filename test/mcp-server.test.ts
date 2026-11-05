import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Invoice } from '@conformo/core';
import { resolveOutputPath, PathPolicyError } from '../packages/mcp-server/src/paths.ts';

const root = process.cwd();
const serverTs = path.join(root, 'packages', 'mcp-server', 'src', 'server.ts');
// tsx as an --import loader, not its CLI: the CLI re-spawns the server as a grandchild, and on Windows kill() reaches
// only the CLI, leaving the server alive and holding its cwd (rmSync then fails with EPERM).
const tsxLoader = pathToFileURL(path.join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;
const version = (JSON.parse(fs.readFileSync(path.join(root, 'packages', 'mcp-server', 'package.json'), 'utf8')) as { version: string }).version;
const fixture = (n: string): Invoice => JSON.parse(fs.readFileSync(path.join(root, 'fixtures', n), 'utf8')) as Invoice;

// Spawned with node + the tsx loader directly: no `npx`, no shell, so it behaves the same on Windows and Linux.
// The child runs in a scratch directory (so outputPath tests write there), hence TSX_TSCONFIG_PATH for the path aliases.
const childEnv = (extra: Record<string, string> = {}): Record<string, string> => ({
  ...(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>),
  TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json'),
  CONFORMO_MCP_ALLOW_ANY_PATH: '',
  ...extra,
});

interface Harness { client: Client; cwd: string; baseUrl?: string; stop(): Promise<void> }
type Structured = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Result = { content: { type: string; text: string }[]; structuredContent?: Structured; _meta?: Structured; isError?: boolean };

async function connectStdio(extraEnv: Record<string, string> = {}): Promise<Harness> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'conformo-mcp-stdio-'));
  const client = new Client({ name: 'mcp-server-test', version: '0.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', tsxLoader, serverTs], cwd, env: childEnv(extraEnv), stderr: 'pipe' }));
  return { client, cwd, stop: async () => { await client.close(); fs.rmSync(cwd, { recursive: true, force: true }); } };
}

async function connectHttp(): Promise<Harness> {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'conformo-mcp-http-'));
  const child: ChildProcess = spawn(process.execPath, ['--import', tsxLoader, serverTs, '--http', '--port', '0', '--max-body-bytes', '200000'], { cwd, env: childEnv(), stdio: ['ignore', 'ignore', 'pipe'] });
  const url = await new Promise<string>((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`server did not start: ${buf}`)), 45_000);
    child.stderr!.on('data', (d: Buffer) => {
      buf += d.toString();
      const m = /listening on (http:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(timer); resolve(m[1]!); }
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited early (${code}): ${buf}`)); });
  });
  const client = new Client({ name: 'mcp-server-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return {
    client, cwd, baseUrl: url.replace(/\/mcp$/, ''),
    // kill() only sends the signal. Windows locks a live process's cwd, so removing it before 'exit' fails with EPERM.
    stop: async () => {
      await client.close();
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
        child.kill();
        await exited;
      }
      fs.rmSync(cwd, { recursive: true, force: true });
    },
  };
}

const call = async (h: Harness, name: string, args: Record<string, unknown>): Promise<Result> =>
  (await h.client.callTool({ name, arguments: args })) as unknown as Result;

const TOOLS = ['convert_invoice', 'create_invoice', 'create_invoice_pdf', 'explain_validation_rule', 'get_country_requirements', 'parse_invoice', 'validate_invoice'];

function suite(label: string, connect: () => Promise<Harness>): void {
  describe(`mcp-server over ${label}`, () => {
    let h: Harness;
    beforeAll(async () => { h = await connect(); }, 90_000);
    afterAll(async () => { await h?.stop(); });

    it('reports the package.json version', () => {
      expect(h.client.getServerVersion()).toMatchObject({ name: 'conformo', version });
    });

    it('lists all tools with annotations, outputSchema and agent-facing descriptions', async () => {
      const { tools } = await h.client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(TOOLS);
      for (const t of tools) {
        expect(t.outputSchema, t.name).toBeDefined();
        expect(t.annotations, t.name).toBeDefined();
        expect(t.annotations!.openWorldHint, t.name).toBe(false);
        expect(t.annotations!.idempotentHint, t.name).toBe(true);
        expect(t.description!.length, t.name).toBeGreaterThan(150);
      }
      const by = Object.fromEntries(tools.map((t) => [t.name, t]));
      for (const n of TOOLS.filter((x) => x !== 'create_invoice_pdf')) {
        expect(by[n]!.annotations!.readOnlyHint, n).toBe(true);
        expect(by[n]!.annotations!.destructiveHint, n).toBe(false);
      }
      expect(by.create_invoice_pdf!.annotations!.readOnlyHint).toBe(false);
      // Structured input, not a JSON string: the invoice schema is embedded with BT descriptions.
      const inv = (by.create_invoice!.inputSchema as any).properties.invoice;
      expect(inv.properties.lines.description).toMatch(/BG-25/);
      expect(inv.properties.seller.properties.vatId.description).toMatch(/BT-31/);
      expect((by.create_invoice!.inputSchema as any).properties.format.enum).toContain('xrechnung-cii');
      expect(by.create_invoice!.description).toMatch(/minor units/);
      expect(by.create_invoice!.description).toMatch(/NOT transmit|does NOT/i);
    });

    it('create_invoice (xrechnung-cii) then validate_invoice is valid', async () => {
      const created = await call(h, 'create_invoice', { invoice: fixture('xrechnung-public-sector.json'), format: 'xrechnung-cii' });
      expect(created.isError).toBeFalsy();
      expect(created.structuredContent!.format).toBe('xrechnung-cii');
      expect(created.structuredContent!.xml).toContain('<rsm:CrossIndustryInvoice');
      expect(created.content[0]!.text).toBe(created.structuredContent!.xml);
      expect(Array.isArray(created.structuredContent!.warnings)).toBe(true);

      const v = await call(h, 'validate_invoice', { xml: created.structuredContent!.xml });
      expect(v.structuredContent!.valid).toBe(true);
      expect(v.structuredContent!.origin).toBe('xml');
      expect(v.structuredContent!.detected).toMatchObject({ syntax: 'cii', profile: 'xrechnung' });
      expect(v.structuredContent!.ruleSets.length).toBeGreaterThan(0);
      expect(v.structuredContent!.xsd.ran).toBe(true);
      expect(v.structuredContent!.failures).toEqual([]);
      expect(v.content[0]!.text).toMatch(/^VALID/);
    }, 60_000);

    it('create_invoice writes every other format too', async () => {
      for (const format of ['cii', 'cii-extended', 'ubl', 'xrechnung-ubl', 'peppol-ubl']) {
        const file = format === 'xrechnung-ubl' ? 'xrechnung-public-sector.json' : 'sample-invoice.json';
        const r = await call(h, 'create_invoice', { invoice: fixture(file), format });
        expect(r.isError, format).toBeFalsy();
        expect(r.structuredContent!.xml, format).toContain('<?xml');
      }
    }, 60_000);

    it('create_invoice reports every semantic problem as an isError result, without a stack trace', async () => {
      const bad = { ...fixture('sample-invoice.json'), issueDate: '2026-02-30', dueDate: '2026-13-01' };
      const r = await call(h, 'create_invoice', { invoice: bad, format: 'cii' });
      expect(r.isError).toBe(true);
      const issues = r._meta!.issues as { path: string; bt: string; message: string }[];
      expect(issues.length).toBeGreaterThanOrEqual(2);
      expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(['issueDate', 'dueDate']));
      expect(issues.find((i) => i.path === 'issueDate')!.bt).toBe('BT-2');
      expect(r.content[0]!.text).toContain('issueDate [BT-2]');
      expect(r.content[0]!.text).not.toMatch(/\n\s+at /);
    });

    it('create_invoice rejects structurally invalid input (unknown key, missing fields) with a readable error', async () => {
      let text = '';
      try {
        const r = await call(h, 'create_invoice', { invoice: { number: 'X', surprise: 1 }, format: 'cii' });
        expect(r.isError).toBe(true);
        text = r.content[0]!.text;
      } catch (e) {
        text = (e as Error).message; // SDK versions differ: protocol error vs isError result
      }
      expect(text).toMatch(/issueDate|seller|lines|surprise|Unrecognized/);
    });

    it('validate_invoice reports failures with rule ids for a broken document', async () => {
      const xml = fs.readFileSync(path.join(root, 'fixtures', 'negative', 'broken-invoice.xml'), 'utf8');
      const r = await call(h, 'validate_invoice', { xml });
      if (r.isError) { expect(r.content[0]!.text.length).toBeGreaterThan(0); return; }
      expect(r.structuredContent!.valid).toBe(false);
      const failures = r.structuredContent!.failures as { ruleId: string; message: string }[];
      expect(failures.length).toBeGreaterThan(0);
      expect(failures[0]!.ruleId).toMatch(/\S/);
      expect(r.content[0]!.text).toMatch(/^INVALID/);
    }, 60_000);

    it('validate_invoice groups repeated hits of one rule in its text and keeps one entry per hit in structuredContent', async () => {
      const xml = fs.readFileSync(path.join(root, 'fixtures', 'negative', 'currency-id-on-amounts.xml'), 'utf8');
      const r = await call(h, 'validate_invoice', { xml });
      expect(r.isError).toBeFalsy();
      const failures = r.structuredContent!.failures as { ruleId: string; element?: string; path?: string; message: string }[];
      expect(failures).toHaveLength(15);
      expect(failures.every((f) => f.ruleId === 'CII-DT-031' && f.element && f.path)).toBe(true);
      const t = r.content[0]!.text;
      expect(t.match(/CII-DT-031/g)!.length).toBe(1);
      expect(t).toMatch(/\[FATAL\] CII-DT-031, 15 places: ChargeAmount \(lines 1, 2, 3\)/);
      expect(t).toMatch(/Fix: Remove the currencyID attribute/);
    }, 60_000);

    it('validate_invoice: not XML is an isError result; neither/both inputs are refused; country layers run', async () => {
      const notXml = await call(h, 'validate_invoice', { xml: 'this is not xml' });
      expect(notXml.isError).toBe(true);
      const neither = await call(h, 'validate_invoice', {});
      expect(neither.isError).toBe(true);
      expect(neither.content[0]!.text).toMatch(/exactly one of/);
      const created = await call(h, 'create_invoice', { invoice: fixture('sample-invoice.json'), format: 'cii' });
      const de = await call(h, 'validate_invoice', { xml: created.structuredContent!.xml, country: 'DE' });
      expect(typeof de.structuredContent!.valid).toBe('boolean');
      expect(de.structuredContent!.notices).toBeDefined();
      const bogus = await call(h, 'validate_invoice', { pdfBase64: Buffer.from('hello world').toString('base64') }).catch((e: Error) => ({ isError: true, content: [{ type: 'text', text: e.message }] }));
      expect(bogus.isError).toBe(true);
    }, 60_000);

    it('convert_invoice: CII to UBL, and back, keeping the invoice number', async () => {
      const cii = (await call(h, 'create_invoice', { invoice: fixture('sample-invoice.json'), format: 'cii' })).structuredContent!.xml as string;
      const ubl = await call(h, 'convert_invoice', { xml: cii, to: 'ubl' });
      expect(ubl.isError).toBeFalsy();
      expect(ubl.structuredContent).toMatchObject({ format: 'ubl', from: 'cii' });
      expect(ubl.structuredContent!.xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
      const back = await call(h, 'convert_invoice', { xml: ubl.structuredContent!.xml, to: 'cii' });
      expect(back.structuredContent!.from).toBe('ubl-invoice');
      expect(back.structuredContent!.xml).toContain(fixture('sample-invoice.json').number);
      const none = await call(h, 'convert_invoice', { to: 'ubl' });
      expect(none.isError).toBe(true);
    }, 60_000);

    it('parse_invoice returns the Invoice model, which create_invoice accepts again', async () => {
      const original = fixture('xrechnung-public-sector.json');
      const cii = (await call(h, 'create_invoice', { invoice: original, format: 'cii' })).structuredContent!.xml as string;
      const parsed = await call(h, 'parse_invoice', { xml: cii });
      expect(parsed.isError).toBeFalsy();
      expect(parsed.structuredContent!.format).toBe('cii');
      expect(parsed.structuredContent!.origin).toBe('xml');
      const inv = parsed.structuredContent!.invoice as Invoice;
      expect(inv.number).toBe(original.number);
      expect(inv.lines).toHaveLength(original.lines.length);
      expect(inv.lines[0]!.unitPriceMinor).toBe(original.lines[0]!.unitPriceMinor);
      const again = await call(h, 'create_invoice', { invoice: inv, format: 'cii' });
      expect(again.isError, again.content[0]!.text).toBeFalsy();
      expect(again.structuredContent!.xml).toBe(cii);
    }, 60_000);

    it('PDF round trip: create_invoice_pdf (base64) -> validate_invoice, parse_invoice, convert_invoice', async () => {
      const invoice = fixture('sample-invoice.json');
      const pdf = await call(h, 'create_invoice_pdf', { invoice, profile: 'en16931', template: 'modern' });
      expect(pdf.isError, pdf.content[0]?.text).toBeFalsy();
      const s = pdf.structuredContent!;
      expect(s.profile).toBe('en16931');
      expect(s.xmlFilename).toMatch(/\.xml$/);
      expect(s.outputPath).toBeUndefined();
      const bytes = Buffer.from(s.pdfBase64 as string, 'base64');
      expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
      expect(bytes.length).toBe(s.byteLength);

      const v = await call(h, 'validate_invoice', { pdfBase64: s.pdfBase64 });
      expect(v.structuredContent!.valid).toBe(true);
      expect(v.structuredContent!.origin).toBe('pdf');
      expect(v.structuredContent!.embeddedFilename).toBe(s.xmlFilename);

      const p = await call(h, 'parse_invoice', { pdfBase64: s.pdfBase64 });
      expect((p.structuredContent!.invoice as Invoice).number).toBe(invoice.number);
      expect(p.structuredContent!.origin).toBe('pdf');

      const c = await call(h, 'convert_invoice', { pdfBase64: s.pdfBase64, to: 'ubl' });
      expect(c.structuredContent!.xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');

      // Deterministic: same input, same bytes.
      const again = await call(h, 'create_invoice_pdf', { invoice, profile: 'en16931', template: 'modern' });
      expect(again.structuredContent!.sha256).toBe(s.sha256);
    }, 120_000);

    it('create_invoice_pdf with xrechnung profile validates', async () => {
      const pdf = await call(h, 'create_invoice_pdf', { invoice: fixture('xrechnung-public-sector.json'), profile: 'xrechnung' });
      expect(pdf.isError, pdf.content[0]?.text).toBeFalsy();
      const v = await call(h, 'validate_invoice', { pdfBase64: pdf.structuredContent!.pdfBase64 });
      expect(v.structuredContent!.valid).toBe(true);
    }, 120_000);

    it('create_invoice_pdf outputPath: writes inside the working directory, refuses overwrite and escapes', async () => {
      const invoice = fixture('sample-invoice.json');
      const ok = await call(h, 'create_invoice_pdf', { invoice, outputPath: path.join('out', 'inv.pdf') });
      expect(ok.isError, ok.content[0]?.text).toBeFalsy();
      const written = path.join(h.cwd, 'out', 'inv.pdf');
      expect(fs.realpathSync(ok.structuredContent!.outputPath)).toBe(fs.realpathSync(written));
      expect(ok.structuredContent!.pdfBase64).toBeUndefined();
      expect(fs.readFileSync(written).subarray(0, 4).toString()).toBe('%PDF');
      const size = fs.statSync(written).size;
      expect(size).toBe(ok.structuredContent!.byteLength);

      const again = await call(h, 'create_invoice_pdf', { invoice, outputPath: path.join('out', 'inv.pdf') });
      expect(again.isError).toBe(true);
      expect(again.content[0]!.text).toMatch(/overwrite/);

      fs.writeFileSync(written, 'sentinel');
      const over = await call(h, 'create_invoice_pdf', { invoice, outputPath: path.join('out', 'inv.pdf'), overwrite: true });
      expect(over.isError).toBeFalsy();
      expect(fs.statSync(written).size).toBe(size);

      const escape = await call(h, 'create_invoice_pdf', { invoice, outputPath: path.join('..', 'conformo-escape.pdf') });
      expect(escape.isError).toBe(true);
      expect(escape.content[0]!.text).toMatch(/outside/);
      expect(fs.existsSync(path.join(h.cwd, '..', 'conformo-escape.pdf'))).toBe(false);
      const abs = await call(h, 'create_invoice_pdf', { invoice, outputPath: path.join(os.tmpdir(), 'conformo-abs-escape.pdf') });
      expect(abs.isError).toBe(true);
      const notPdf = await call(h, 'create_invoice_pdf', { invoice, outputPath: 'notes.txt' });
      expect(notPdf.isError).toBe(true);
    }, 120_000);

    it('get_country_requirements: known country (any case), unknown country lists the supported ones', async () => {
      const de = await call(h, 'get_country_requirements', { country: 'de' });
      expect(de.isError).toBeFalsy();
      expect(de.structuredContent!.country).toBe('DE');
      expect(Object.keys(de.structuredContent!.conformoSupport).length).toBeGreaterThan(0);
      const it_ = await call(h, 'get_country_requirements', { country: 'IT' });
      if (!it_.isError) expect(it_.structuredContent!.conformoSupport.fatturapa).toMatchObject({ generate: false });
      const zz = await call(h, 'get_country_requirements', { country: 'ZZ' });
      expect(zz.isError).toBe(true);
      expect(zz.content[0]!.text).toMatch(/Supported countries: .*DE/);
    });

    it('explain_validation_rule: known rule explained, unknown rule is found:false (not an error)', async () => {
      const known = await call(h, 'explain_validation_rule', { ruleId: 'BR-CO-15' });
      expect(known.isError).toBeFalsy();
      expect(known.structuredContent!.found).toBe(true);
      expect(known.structuredContent!.ruleId).toBe('BR-CO-15');
      const unknown = await call(h, 'explain_validation_rule', { ruleId: 'NOPE-123' });
      expect(unknown.isError).toBeFalsy();
      expect(unknown.structuredContent!.found).toBe(false);
    });
  });
}

suite('stdio', () => connectStdio());

describe('mcp-server stdio: CONFORMO_MCP_ALLOW_ANY_PATH=1 lifts the working-directory limit', () => {
  it('writes outside the cwd only when explicitly allowed', async () => {
    const h = await connectStdio({ CONFORMO_MCP_ALLOW_ANY_PATH: '1' });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'conformo-mcp-outside-'));
    try {
      const target = path.join(outside, 'x.pdf');
      const r = await call(h, 'create_invoice_pdf', { invoice: fixture('sample-invoice.json'), outputPath: target });
      expect(r.isError, r.content[0]?.text).toBeFalsy();
      expect(fs.existsSync(target)).toBe(true);
    } finally {
      await h.stop();
      fs.rmSync(outside, { recursive: true, force: true });
    }
  }, 120_000);
});

suite('streamable HTTP', () => connectHttp());

describe('mcp-server HTTP specifics', () => {
  let h: Harness;
  beforeAll(async () => { h = await connectHttp(); }, 90_000);
  afterAll(async () => { await h?.stop(); });
  const mcp = (): string => `${h.baseUrl}/mcp`;
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

  it('oversize body -> 413 JSON-RPC error', async () => {
    const res = await fetch(mcp(), { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(300_000) } }) });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { jsonrpc: string; error: { message: string } };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error.message).toMatch(/limit/);
  });

  it('GET and DELETE /mcp -> 405 JSON-RPC error with Allow: POST', async () => {
    for (const method of ['GET', 'DELETE']) {
      const res = await fetch(mcp(), { method, headers: { accept: 'application/json, text/event-stream' } });
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
      expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32000);
    }
  });

  it('GET /healthz -> ok with the package version', async () => {
    const res = await fetch(`${h.baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', name: 'conformo', version });
  });

  it('invalid JSON -> 400 parse error; unknown path -> 404', async () => {
    const bad = await fetch(mcp(), { method: 'POST', headers, body: '{nope' });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: number } }).error.code).toBe(-32700);
    expect((await fetch(`${h.baseUrl}/other`)).status).toBe(404);
  });

  it('is stateless: JSON responses, no session id, any request works without initialize', async () => {
    const res = await fetch(mcp(), { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('mcp-session-id')).toBeNull();
    const body = (await res.json()) as { id: number; result: { tools: unknown[] } };
    expect(body.id).toBe(7);
    expect(body.result.tools).toHaveLength(TOOLS.length);
  });
});

describe('mcp-server output path policy (unit)', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'conformo-mcp-paths-'));
  afterAll(() => fs.rmSync(cwd, { recursive: true, force: true }));

  it('accepts paths inside cwd, refuses escapes and non-pdf', () => {
    expect(resolveOutputPath('a/b.pdf', cwd)).toBe(path.resolve(cwd, 'a', 'b.pdf'));
    expect(() => resolveOutputPath('../b.pdf', cwd)).toThrow(PathPolicyError);
    expect(() => resolveOutputPath(path.join(os.tmpdir(), 'b.pdf'), cwd)).toThrow(PathPolicyError);
    expect(() => resolveOutputPath('a/b.txt', cwd)).toThrow(/\.pdf/);
  });

  it('refuses a symlink that points out of cwd', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'conformo-mcp-link-target-'));
    try {
      fs.symlinkSync(outside, path.join(cwd, 'link'), 'junction');
    } catch {
      fs.rmSync(outside, { recursive: true, force: true });
      return; // symlinks unavailable (unprivileged Windows)
    }
    try {
      expect(() => resolveOutputPath('link/x.pdf', cwd)).toThrow(PathPolicyError);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
