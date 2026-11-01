/**
 * The HTTP API: a Hono app that is a thin wrapper over @conformo/toolkit. Stateless: no storage, no sessions, nothing is
 * written anywhere. Every operation is a toolkit call; this file only does request validation, error mapping and shaping.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { ZodIssue, ZodTypeAny, z } from 'zod';
import {
  convert, createPdf, createXml, explainRule, getRequirements, parse, validate,
  InvoiceInputError, SUPPORTED_COUNTRIES, ValidationInputError,
} from '@conformo/toolkit';
import type { Invoice } from '@conformo/toolkit';
import * as s from './schemas.js';
import { buildOpenApi } from './openapi.js';
import { SERVER_VERSION } from './version.js';

export const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface AppOptions {
  /** Request body limit in bytes. Default 8 MiB, or CONFORMO_SERVER_MAX_BODY. */
  maxBodyBytes?: number;
  /** Allowed CORS origins (`['*']` for any). Default: none, so no CORS headers are sent. Env: CONFORMO_SERVER_CORS_ORIGINS (comma list). */
  cors?: string[];
  /** Where unexpected errors are logged (message only, never a stack). Default console.error. */
  logger?: (message: string) => void;
}

type Issue = { path: string; bt: string; severity: string; message: string };

class HttpError extends Error {
  constructor(readonly status: 400 | 404 | 413 | 422, readonly code: z.infer<typeof s.errorSchema>['error'], message: string, readonly issues?: Issue[]) { super(message); }
}

const fail = (c: Context, e: HttpError): Response =>
  c.json({ error: e.code, message: e.message, ...(e.issues ? { issues: e.issues } : {}) }, e.status);

const pathOf = (p: (string | number)[]): string => p.reduce<string>((a, k) => (typeof k === 'number' ? `${a}[${k}]` : a ? `${a}.${k}` : k), '');
const zodIssue = (i: ZodIssue, strip: boolean): Issue => ({ path: pathOf(strip ? i.path.slice(1) : i.path), bt: '', severity: 'error', message: i.message });

/** Parses the JSON body and checks it against a request schema. Malformed JSON is 400; a wrong shape is 422. */
async function readBody<T extends ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.text();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new HttpError(400, 'malformed_json', 'The request body is not valid JSON.'); }
  const r = schema.safeParse(data);
  if (r.success) return r.data as z.infer<T>;
  const underInvoice = r.error.issues.length > 0 && r.error.issues.every((i) => i.path[0] === 'invoice');
  if (underInvoice) {
    throw new HttpError(422, 'invalid_invoice', `The invoice is not valid: ${r.error.issues.length} problem${r.error.issues.length === 1 ? '' : 's'}. Fix every listed field and call again.`, r.error.issues.map((i) => zodIssue(i, true)));
  }
  const issues = r.error.issues.map((i) => zodIssue(i, false));
  throw new HttpError(422, 'invalid_request', `The request body is not valid: ${issues.map((i) => `${i.path || '(body)'}: ${i.message}`).join('; ')}`, issues);
}

function pdfBytes(b64: string, field: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new HttpError(422, 'invalid_request', `${field} is not valid base64.`);
  const bytes = new Uint8Array(Buffer.from(clean, 'base64'));
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 4)) !== '%PDF') throw new HttpError(422, 'invalid_request', `${field} does not decode to a PDF (missing %PDF header).`);
  return bytes;
}

function exactlyOne(a: string | undefined, b: string | undefined, names: [string, string]): void {
  if ((a === undefined) === (b === undefined)) throw new HttpError(422, 'invalid_request', `Provide exactly one of \`${names[0]}\` or \`${names[1]}\`.`, [{ path: '', bt: '', severity: 'error', message: `Provide exactly one of \`${names[0]}\` or \`${names[1]}\`.` }]);
}

const sourceOf = (xml: string | undefined, pdf: string | undefined, names: [string, string]): string | Uint8Array => {
  exactlyOne(xml, pdf, names);
  return xml !== undefined ? xml : pdfBytes(pdf!, names[1]);
};

/** Toolkit errors on a user-supplied document are the caller's problem (422), not the server's. */
async function onDocument<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof InvoiceInputError) throw invalidInvoice(err);
    if (err instanceof ValidationInputError) throw new HttpError(422, 'unprocessable_document', err.message);
    throw new HttpError(422, 'unprocessable_document', err instanceof Error ? err.message : 'The document could not be read.');
  }
}

const invalidInvoice = (err: InvoiceInputError): HttpError =>
  new HttpError(422, 'invalid_invoice', `The invoice cannot be written: ${err.issues.length} problem${err.issues.length === 1 ? '' : 's'}. Fix every listed field and call again.`,
    err.issues.map((i) => ({ path: i.path, bt: i.bt ?? '', severity: i.severity, message: i.message })));

async function onInvoice<T>(fn: () => Promise<T> | T): Promise<T> {
  try { return await fn(); } catch (err) { if (err instanceof InvoiceInputError) throw invalidInvoice(err); throw err; }
}

const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const DOCS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conformo HTTP API</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1b1f24;--muted:#57606a;--line:#d0d7de}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9da7b3;--line:#30363d}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,sans-serif}
main{max-width:42rem;margin:0 auto;padding:2rem 1rem}
code{font:0.95em ui-monospace,monospace}
a{color:inherit}
td,th{border-bottom:1px solid var(--line);padding:.3rem .6rem .3rem 0;text-align:left;vertical-align:top}
table{border-collapse:collapse;width:100%}
p.muted{color:var(--muted)}
</style></head><body><main>
<h1>Conformo HTTP API</h1>
<p>Stateless API for EN 16931 e-invoices: create, validate, convert, parse. Nothing is stored.</p>
<p>The machine-readable description is <a href="openapi.json"><code>openapi.json</code></a> (OpenAPI 3.1). Import it into any OpenAPI client or generator.</p>
<table>
<tr><th>Method and path</th><th>Does</th></tr>
<tr><td><code>POST /v1/invoices/xml</code></td><td>Invoice JSON to e-invoice XML</td></tr>
<tr><td><code>POST /v1/invoices/pdf</code></td><td>Invoice JSON to Factur-X / ZUGFeRD PDF</td></tr>
<tr><td><code>POST /v1/validate</code></td><td>Validate XML or a hybrid PDF</td></tr>
<tr><td><code>POST /v1/convert</code></td><td>Convert between syntaxes</td></tr>
<tr><td><code>POST /v1/parse</code></td><td>Read XML or a hybrid PDF into JSON</td></tr>
<tr><td><code>GET /v1/requirements[/:country]</code></td><td>Country e-invoicing data</td></tr>
<tr><td><code>GET /v1/rules/:id</code></td><td>Explain a validation rule</td></tr>
<tr><td><code>GET /healthz</code></td><td>Liveness</td></tr>
</table>
<p class="muted">Conformo produces, reads and checks documents. It does not transmit over Peppol, a PA, KSeF or SdI, and does not support FatturaPA, KSeF FA(3) or Facturae. A valid result means the listed rule sets passed, not that a tax authority accepts the invoice.</p>
</main></body></html>
`;

function envList(v: string | undefined): string[] | undefined {
  const l = (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return l.length ? l : undefined;
}

export function createApp(options: AppOptions = {}): Hono {
  const envMax = Number(process.env.CONFORMO_SERVER_MAX_BODY);
  const maxBody = options.maxBodyBytes ?? (Number.isInteger(envMax) && envMax > 0 ? envMax : DEFAULT_MAX_BODY_BYTES);
  const origins = options.cors ?? envList(process.env.CONFORMO_SERVER_CORS_ORIGINS);
  const log = options.logger ?? ((m: string) => console.error(m));
  const app = new Hono();

  if (origins) {
    app.use('*', cors({ origin: origins.includes('*') ? '*' : origins, allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type', 'Accept'], exposeHeaders: ['Content-Disposition', 'X-Conformo-Conformance-Level', 'X-Conformo-Xml-Filename'], maxAge: 600 }));
  }
  app.post('/v1/*', bodyLimit({
    maxSize: maxBody,
    onError: (c) => fail(c, new HttpError(413, 'payload_too_large', `The request body exceeds the ${maxBody}-byte limit.`)),
  }));

  app.post('/v1/invoices/xml', async (c) => {
    const b = await readBody(c, s.xmlRequest);
    const r = await onInvoice(() => createXml(b.invoice as Invoice, b.format));
    return c.json({ xml: r.xml, format: r.format, warnings: r.warnings });
  });

  app.post('/v1/invoices/pdf', async (c) => {
    const b = await readBody(c, s.pdfRequest);
    const r = await onInvoice(() => createPdf(b.invoice as Invoice, { ...(b.profile ? { profile: b.profile } : {}), ...(b.template ? { template: b.template } : {}) }));
    if ((c.req.header('accept') ?? '').includes('application/json')) {
      return c.json({ pdfBase64: Buffer.from(r.pdf).toString('base64'), xml: r.xml, xmlFilename: r.xmlFilename, conformanceLevel: r.conformanceLevel });
    }
    return c.body(r.pdf as Uint8Array<ArrayBuffer>, 200, {
      'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="invoice.pdf"',
      'X-Conformo-Conformance-Level': r.conformanceLevel, 'X-Conformo-Xml-Filename': r.xmlFilename,
    });
  });

  app.post('/v1/validate', async (c) => {
    const b = await readBody(c, s.validateRequest);
    const src = sourceOf(b.xml, b.pdfBase64, ['xml', 'pdfBase64']);
    const o = b.options ?? {};
    const r = await onDocument(() => validate(src, { ...(o.country ? { country: o.country } : {}), ...(o.profile ? { profile: o.profile } : {}), ...(o.xsd !== undefined ? { xsd: o.xsd } : {}) }));
    return c.json(plain(r));
  });

  app.post('/v1/convert', async (c) => {
    const b = await readBody(c, s.convertRequest);
    const src = sourceOf(b.source, b.sourcePdfBase64, ['source', 'sourcePdfBase64']);
    const r = await onDocument(() => convert(src, b.to));
    return c.json({ xml: r.xml, from: r.from, to: r.format, warnings: r.warnings, totalsCheck: r.totalsCheck });
  });

  app.post('/v1/parse', async (c) => {
    const b = await readBody(c, s.parseRequest);
    const src = sourceOf(b.xml, b.pdfBase64, ['xml', 'pdfBase64']);
    return c.json(plain(await onDocument(() => parse(src))));
  });

  app.get('/v1/requirements', (c) =>
    c.json({ countries: SUPPORTED_COUNTRIES.map((code) => ({ country: code, name: getRequirements(code)?.name ?? code })) }));

  app.get('/v1/requirements/:country', (c) => {
    const code = c.req.param('country');
    const r = getRequirements(code.toUpperCase());
    if (!r) return fail(c, new HttpError(404, 'not_found', `No data for country "${code}". Supported countries: ${SUPPORTED_COUNTRIES.join(', ')}.`));
    return c.json(plain(r));
  });

  app.get('/v1/rules/:id', (c) => {
    const r = explainRule(c.req.param('id'));
    if (!r.found) return fail(c, new HttpError(404, 'not_found', `No rule "${r.ruleId}" is known to the compiled rule sets.`));
    return c.json(plain(r));
  });

  app.get('/healthz', (c) => c.json({ status: 'ok', version: SERVER_VERSION }));
  app.get('/openapi.json', (c) => c.json(buildOpenApi()));
  app.get('/docs', (c) => c.html(DOCS_HTML));

  app.notFound((c) => fail(c, new HttpError(404, 'not_found', 'No such endpoint.')));
  app.onError((err, c) => {
    if (err instanceof HttpError) return fail(c, err);
    // Message only, never the stack, and never the response body.
    log(`conformo-server: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    return c.json({ error: 'internal_error', message: 'Internal server error.' }, 500);
  });
  return app;
}
