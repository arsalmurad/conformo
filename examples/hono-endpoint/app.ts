/** A ~30-line Hono endpoint over @conformo/toolkit. Run: npx tsx examples/hono-endpoint/app.ts   then POST an invoice to http://127.0.0.1:3000/invoice */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createXml, validate, FORMAT_IDS, InvoiceInputError } from '@conformo/toolkit';
import type { FormatId, Invoice } from '@conformo/toolkit';

export const app = new Hono();

app.post('/invoice', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { invoice?: Invoice; format?: FormatId } | null;
  if (!body?.invoice) return c.json({ error: 'send {"invoice": {...}, "format"?: "xrechnung-ubl"}' }, 400);
  const format = body.format ?? 'xrechnung-ubl';
  if (!FORMAT_IDS.includes(format)) return c.json({ error: `format must be one of ${FORMAT_IDS.join(', ')}` }, 400);
  try {
    const { xml, warnings } = createXml(body.invoice, format);
    const check = await validate(xml); // never hand out a document without saying whether it validates
    return c.json({ xml, warnings, valid: check.valid, ruleSets: check.ruleSets.map((r) => r.id) }, check.valid ? 200 : 422);
  } catch (e) {
    if (e instanceof InvoiceInputError) return c.json({ error: 'invalid_invoice', issues: e.issues }, 422);
    throw e;
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  serve({ fetch: app.fetch, port: 3000, hostname: '127.0.0.1' }, (i) => console.log(`listening on http://127.0.0.1:${i.port}`));
}
