import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { createApp, start, buildOpenApi, openApiText } from '../packages/server/src/index.ts';

const root = process.cwd();
const fixture = (n: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(root, 'fixtures', n), 'utf8')) as Record<string, unknown>;
const xrechnung = fixture('xrechnung-public-sector.json');
const peppol = fixture('peppol-belgium-full.json');

const app = createApp({ logger: () => {} });
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const post = (p: string, body: unknown, headers: Record<string, string> = {}, a = app): Promise<Response> =>
  Promise.resolve(a.request(p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const postJson = async (p: string, body: unknown): Promise<{ status: number; json: J }> => { const r = await post(p, body); return { status: r.status, json: (await r.json()) as J }; };

describe('server: create and validate', () => {
  it('xrechnung-ubl create -> validate round trip is valid', async () => {
    const c = await postJson('/v1/invoices/xml', { invoice: xrechnung, format: 'xrechnung-ubl' });
    expect(c.status).toBe(200);
    expect(c.json.format).toBe('xrechnung-ubl');
    expect(c.json.xml).toContain('<Invoice');
    expect(Array.isArray(c.json.warnings)).toBe(true);
    const v = await postJson('/v1/validate', { xml: c.json.xml });
    expect(v.status).toBe(200);
    expect(v.json.valid).toBe(true);
    expect(v.json.ruleSets.length).toBeGreaterThan(0);
    expect(v.json.xsd.ran).toBe(true);
  });

  it('peppol fixture creates peppol-ubl XML that validates', async () => {
    const c = await postJson('/v1/invoices/xml', { invoice: peppol, format: 'peppol-ubl' });
    expect(c.status).toBe(200);
    const v = await postJson('/v1/validate', { xml: c.json.xml, options: { xsd: true } });
    expect(v.json.valid).toBe(true);
  });

  it('validate answers 200 with valid:false for a broken document', async () => {
    const c = await postJson('/v1/invoices/xml', { invoice: xrechnung, format: 'ubl' });
    const broken = (c.json.xml as string).replace(/<cbc:PayableAmount([^>]*)>[^<]*</, '<cbc:PayableAmount$1>1.00<');
    const v = await postJson('/v1/validate', { xml: broken });
    expect(v.status).toBe(200);
    expect(v.json.valid).toBe(false);
    expect(v.json.results.some((r: J) => r.severity === 'error' || r.severity === 'fatal')).toBe(true);
  });

  it('pdf: default is application/pdf bytes; JSON on request; all 3 profiles validate', async () => {
    const raw = await post('/v1/invoices/pdf', { invoice: xrechnung });
    expect(raw.status).toBe(200);
    expect(raw.headers.get('content-type')).toBe('application/pdf');
    const bytes = new Uint8Array(await raw.arrayBuffer());
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('%PDF');

    for (const profile of ['en16931', 'xrechnung', 'extended']) {
      const r = await post('/v1/invoices/pdf', { invoice: xrechnung, profile }, { accept: 'application/json' });
      expect(r.status).toBe(200);
      const j = (await r.json()) as J;
      expect(j.conformanceLevel).toBeTruthy();
      expect(j.xmlFilename).toMatch(/\.xml$/);
      const v = await postJson('/v1/validate', { pdfBase64: j.pdfBase64 });
      expect(v.status).toBe(200);
      expect(v.json.origin).toBe('pdf');
      expect(v.json.valid, `profile ${profile}: ${JSON.stringify(v.json.results.filter((x: J) => x.severity === 'error'))}`).toBe(true);
    }
  }, 60_000);

  it('pdf output is deterministic', async () => {
    const a = new Uint8Array(await (await post('/v1/invoices/pdf', { invoice: peppol })).arrayBuffer());
    const b = new Uint8Array(await (await post('/v1/invoices/pdf', { invoice: peppol })).arrayBuffer());
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  }, 60_000);
});

describe('server: convert and parse', () => {
  it('converts CII to UBL and the result validates', async () => {
    const cii = await postJson('/v1/invoices/xml', { invoice: peppol, format: 'cii' });
    const r = await postJson('/v1/convert', { source: cii.json.xml, to: 'ubl' });
    expect(r.status).toBe(200);
    expect(r.json.from).toBe('cii');
    expect(r.json.to).toBe('ubl');
    expect(r.json.totalsCheck.matches).toBe(true);
    expect(r.json.xml).toContain('<Invoice');
    expect((await postJson('/v1/validate', { xml: r.json.xml })).json.valid).toBe(true);
  });

  it('converts from a PDF', async () => {
    const p = (await (await post('/v1/invoices/pdf', { invoice: xrechnung }, { accept: 'application/json' })).json()) as J;
    const r = await postJson('/v1/convert', { sourcePdfBase64: p.pdfBase64, to: 'xrechnung-ubl' });
    expect(r.status).toBe(200);
    expect(r.json.from).toBe('cii');
  }, 60_000);

  it('parses XML back into the invoice with matching totals', async () => {
    const c = await postJson('/v1/invoices/xml', { invoice: peppol, format: 'peppol-ubl' });
    const r = await postJson('/v1/parse', { xml: c.json.xml });
    expect(r.status).toBe(200);
    expect(r.json.invoice.number).toBe(peppol.number);
    expect(r.json.format).toBe('ubl-invoice');
    expect(r.json.totalsCheck).toEqual({ matches: true, differences: [] });
  });

  it('parses a PDF', async () => {
    const p = (await (await post('/v1/invoices/pdf', { invoice: peppol }, { accept: 'application/json' })).json()) as J;
    const r = await postJson('/v1/parse', { pdfBase64: p.pdfBase64 });
    expect(r.status).toBe(200);
    expect(r.json.origin).toBe('pdf');
    expect(r.json.invoice.number).toBe(peppol.number);
  }, 60_000);
});

describe('server: reference data', () => {
  it('requirements for DE', async () => {
    const r = await app.request('/v1/requirements/de');
    expect(r.status).toBe(200);
    const j = (await r.json()) as J;
    expect(j.country).toBe('DE');
    expect(Object.keys(j.conformoSupport).length).toBeGreaterThan(0);
  });

  it('requirements for IT say FatturaPA is unsupported', async () => {
    const j = (await (await app.request('/v1/requirements/IT')).json()) as J;
    expect(j.country).toBe('IT');
    expect(j.conformoSupport.fatturapa).toMatchObject({ generate: false, read: false, validate: false });
  });

  it('lists countries, 404s on an unknown one', async () => {
    const l = (await (await app.request('/v1/requirements')).json()) as J;
    expect(l.countries.map((c: J) => c.country)).toEqual(expect.arrayContaining(['DE', 'IT']));
    const r = await app.request('/v1/requirements/ZZ');
    expect(r.status).toBe(404);
    expect(((await r.json()) as J).error).toBe('not_found');
  });

  it('explains BR-CO-15; unknown rule is 404', async () => {
    const r = await app.request('/v1/rules/BR-CO-15');
    expect(r.status).toBe(200);
    const j = (await r.json()) as J;
    expect(j.ruleId).toBe('BR-CO-15');
    expect(j.found).toBe(true);
    expect(j.official.length).toBeGreaterThan(0);
    expect((await app.request('/v1/rules/NOPE-123')).status).toBe(404);
  });

  it('healthz and docs', async () => {
    const h = (await (await app.request('/healthz')).json()) as J;
    expect(h.status).toBe('ok');
    const d = await app.request('/docs');
    expect(d.headers.get('content-type')).toContain('text/html');
    const html = await d.text();
    expect(html).toContain('openapi.json');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('server: errors', () => {
  it('bad invoice -> 422 invalid_invoice with issues', async () => {
    const bad = structuredClone(xrechnung) as J;
    bad.lines[0].taxRate = undefined;
    delete bad.lines[0].taxCategory;
    const r = await postJson('/v1/invoices/xml', { invoice: bad, format: 'ubl' });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe('invalid_invoice');
    expect(r.json.issues.length).toBeGreaterThan(0);
    for (const i of r.json.issues) expect(Object.keys(i).sort()).toEqual(['bt', 'message', 'path', 'severity']);
    expect(JSON.stringify(r.json)).not.toMatch(/\bat .*\.(ts|js):\d+/);
  });

  it('semantically invalid invoice (checkInvoice errors) -> 422 invalid_invoice', async () => {
    const bad = structuredClone(xrechnung) as J;
    bad.currency = 'EUR';
    bad.lines = [];
    const r = await postJson('/v1/invoices/xml', { invoice: bad, format: 'cii' });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe('invalid_invoice');
    expect(r.json.issues.length).toBeGreaterThan(0);
  });

  it('malformed JSON -> 400', async () => {
    const r = await post('/v1/validate', '{nope');
    expect(r.status).toBe(400);
    expect(((await r.json()) as J).error).toBe('malformed_json');
  });

  it('missing or both sources, bad base64, non-pdf -> 422 invalid_request', async () => {
    for (const body of [{}, { xml: '<a/>', pdfBase64: 'JVBERi0=' }, { pdfBase64: '***' }, { pdfBase64: Buffer.from('hello world').toString('base64') }, { xml: '<a/>', surprise: 1 }]) {
      const r = await postJson('/v1/validate', body);
      expect(r.status, JSON.stringify(body)).toBe(422);
      expect(r.json.error).toBe('invalid_request');
    }
  });

  it('not an invoice -> 422 unprocessable_document, no stack', async () => {
    for (const p of ['/v1/validate', '/v1/parse']) {
      const r = await postJson(p, { xml: '<hello/>' });
      expect(r.status).toBe(422);
      expect(r.json.error).toBe('unprocessable_document');
      expect(JSON.stringify(r.json)).not.toMatch(/\n\s+at /);
    }
    expect((await postJson('/v1/convert', { source: '<hello/>', to: 'ubl' })).status).toBe(422);
    expect((await postJson('/v1/convert', { source: '<hello/>', to: 'fatturapa' })).status).toBe(422);
  });

  it('413 when the body exceeds the limit (Content-Length and chunked)', async () => {
    const small = createApp({ maxBodyBytes: 1000, logger: () => {} });
    const big = JSON.stringify({ xml: 'x'.repeat(5000) });
    const r = await post('/v1/validate', big, {}, small);
    expect(r.status).toBe(413);
    expect(((await r.json()) as J).error).toBe('payload_too_large');
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const r2 = await small.request('/v1/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit);
    expect(r2.status).toBe(413);
  });

  it('unknown route is a JSON 404', async () => {
    const r = await app.request('/nope');
    expect(r.status).toBe(404);
    expect(((await r.json()) as J).error).toBe('not_found');
  });
});

describe('server: CORS', () => {
  const origin = 'https://app.example';
  it('off by default: no CORS headers, no preflight handling', async () => {
    const r = await app.request('/healthz', { headers: { origin } });
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    const o = await app.request('/v1/validate', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
    expect(o.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('on for a listed origin only', async () => {
    const a = createApp({ cors: [origin] });
    expect((await a.request('/healthz', { headers: { origin } })).headers.get('access-control-allow-origin')).toBe(origin);
    expect((await a.request('/healthz', { headers: { origin: 'https://evil.example' } })).headers.get('access-control-allow-origin')).toBeNull();
    const pre = await a.request('/v1/validate', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(origin);
  });

  it('CONFORMO_SERVER_CORS_ORIGINS env enables it', async () => {
    process.env.CONFORMO_SERVER_CORS_ORIGINS = `${origin}, https://b.example`;
    try {
      const a = createApp();
      expect((await a.request('/healthz', { headers: { origin: 'https://b.example' } })).headers.get('access-control-allow-origin')).toBe('https://b.example');
    } finally { delete process.env.CONFORMO_SERVER_CORS_ORIGINS; }
  });
});

describe('server: generated OpenAPI', () => {
  const spec = buildOpenApi() as J;

  it('is structurally valid 3.1 and every $ref resolves', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toMatch(/^\d+\.\d+\.\d+$/);
    const paths = Object.keys(spec.paths);
    expect(paths).toEqual(expect.arrayContaining(['/v1/invoices/xml', '/v1/invoices/pdf', '/v1/validate', '/v1/convert', '/v1/parse', '/v1/requirements', '/v1/requirements/{country}', '/v1/rules/{id}', '/healthz', '/openapi.json', '/docs']));
    const ids = new Set<string>();
    for (const [p, item] of Object.entries<J>(spec.paths)) {
      const ops = Object.entries<J>(item);
      expect(ops.length, p).toBeGreaterThan(0);
      for (const [method, op] of ops) {
        expect(['get', 'post']).toContain(method);
        expect(op.responses && Object.keys(op.responses).length, `${method} ${p} responses`).toBeGreaterThan(0);
        expect(op.operationId).toBeTruthy();
        expect(ids.has(op.operationId)).toBe(false);
        ids.add(op.operationId);
        const pathParams = [...p.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        expect((op.parameters ?? []).map((x: J) => x.name).sort()).toEqual(pathParams.sort());
        if (method === 'post') {
          expect(op.requestBody, p).toBeTruthy();
          expect(op.responses['422'], p).toBeTruthy();
          expect(op.responses['413'], p).toBeTruthy();
        }
      }
    }
    const refs: string[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { if (k === '$ref') refs.push(v as string); else walk(v); }
    };
    walk(spec);
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) {
      expect(r).toMatch(/^#\//);
      let node: unknown = spec;
      for (const seg of r.slice(2).split('/')) node = (node as J | undefined)?.[seg];
      expect(node, `unresolved ${r}`).toBeTruthy();
    }
    expect(JSON.stringify(spec)).not.toContain('"$schema"');
  });

  it('is derived from the schemas the server enforces', () => {
    expect(spec.components.schemas.Invoice.properties.lines).toBeTruthy();
    const req = spec.paths['/v1/invoices/xml'].post.requestBody.content['application/json'];
    expect(req.schema.properties.invoice).toEqual({ $ref: '#/components/schemas/Invoice' });
    expect(req.schema.properties.format).toEqual({ $ref: '#/components/schemas/FormatId' });
    expect(spec.components.schemas.Error.properties.issues.items).toEqual({ $ref: '#/components/schemas/Issue' });
  });

  it('request examples in the spec are accepted by the server', async () => {
    const ex = spec.paths['/v1/invoices/xml'].post.requestBody.content['application/json'].example;
    const r = await postJson('/v1/invoices/xml', ex);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const pdf = spec.paths['/v1/invoices/pdf'].post.requestBody.content['application/json'].example;
    expect((await post('/v1/invoices/pdf', pdf)).status).toBe(200);
  }, 60_000);

  it('GET /openapi.json serves exactly the generated spec', async () => {
    const r = await app.request('/openapi.json');
    expect(await r.json()).toEqual(spec);
  });

  it('docs/openapi.json is not stale (run: npm run openapi:generate)', () => {
    const committed = fs.readFileSync(path.join(root, 'docs', 'openapi.json'), 'utf8');
    expect(committed).toBe(openApiText());
  });
});

describe('server: listening', () => {
  it('serves real HTTP on an ephemeral port bound to 127.0.0.1', async () => {
    const running = await start({ port: 0, logger: () => {} });
    try {
      expect(running.host).toBe('127.0.0.1');
      expect(running.port).toBeGreaterThan(0);
      const h = await fetch(`${running.url}/healthz`);
      expect(h.status).toBe(200);
      const c = await fetch(`${running.url}/v1/invoices/xml`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invoice: xrechnung, format: 'xrechnung-cii' }) });
      expect(c.status).toBe(200);
      const created = (await c.json()) as J;
      const v = await fetch(`${running.url}/v1/validate`, { method: 'POST', body: JSON.stringify({ xml: created.xml }) });
      expect(((await v.json()) as J).valid).toBe(true);
      const bad = await fetch(`${running.url}/v1/validate`, { method: 'POST', body: '{' });
      expect(bad.status).toBe(400);
    } finally {
      await running.close();
    }
  }, 60_000);
});
