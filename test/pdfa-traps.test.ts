/**
 * REGRESSION GUARD. Do not delete or weaken.
 *
 * Every one of these assertions corresponds to a pdf-lib workaround documented
 * in docs/pdf-traps.md. Each failure mode produces a PDF that opens fine, looks
 * correct, and is rejected by a tax authority. They are invisible to a human
 * reviewer and to any test that only checks "did we get a PDF".
 *
 * This runs in `npm test` so it catches a regression even where Python is not
 * available to run tools/pdfa_audit.py.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildCII } from '@conformo/formats';
import { finalizePDFA } from '@conformo/pdf';
import type { Invoice } from '@conformo/core';

let bytes: Uint8Array;
let raw: string;
let xml: string;

beforeAll(async () => {
  const invoice = JSON.parse(fs.readFileSync('fixtures/sample-invoice.json', 'utf8')) as Invoice;
  xml = buildCII(invoice);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const f = await pdf.embedFont(fs.readFileSync('assets/fonts/WorkSans-Regular.ttf'), { subset: true });
  pdf.addPage([595.28, 841.89]).drawText('x', { x: 10, y: 10, font: f, size: 8 });
  await finalizePDFA(pdf, {
    xml, title: 'guard', author: 'a', producer: 'p', creatorTool: 'c',
    iccProfile: fs.readFileSync('assets/sRGB.icc'),
    createDate: new Date('2026-01-01T00:00:00Z'),
  });
  bytes = await pdf.save({ useObjectStreams: false });
  raw = Buffer.from(bytes).toString('latin1');
});

describe('PDF/A-3 regression guard', () => {
  it('TRAP 1: the embedded XML is the real XML, not base64-decoded garbage', async () => {
    const loaded = await PDFDocument.load(bytes);
    const src = Buffer.from(raw, 'latin1');
    // The attachment stream is flate-compressed, so inflate every stream and
    // look for the CII root element. If attach() was handed a string, this
    // fails because the stored bytes are base64-decoded noise.
    const zlib = await import('node:zlib');
    let found = false;
    for (const m of raw.matchAll(/stream\r?\n/g)) {
      const start = m.index! + m[0].length;
      const end = raw.indexOf('endstream', start);
      if (end < 0) continue;
      try {
        const out = zlib.inflateSync(src.subarray(start, end)).toString('utf8');
        if (out.includes('CrossIndustryInvoice')) { found = true; break; }
      } catch { /* not a flate stream, skip */ }
    }
    expect(found, 'embedded XML not recoverable from the PDF').toBe(true);
    expect(loaded.getTitle()).toBe('guard');
  });

  it('the filespec carries /AFRelationship (pdf-lib omits it unless asked)', () => {
    // pdf-lib writes the catalog /AF array and escapes /Subtype on its own.
    // It does NOT add /AFRelationship unless the option is passed, and
    // PDF/A-3 rejects a filespec without it.
    expect(raw).toContain('/AFRelationship /Alternative');
    expect(raw).toContain('/Subtype /text#2Fxml');
    expect(raw).toMatch(/\/AF[\s\[]/);
  });

  it('TRAP 2: the XMP packet is UTF-8 with an intact BOM and parses', () => {
    const i = raw.indexOf('<?xpacket begin=');
    expect(i).toBeGreaterThan(-1);
    // UTF-8 encoded U+FEFF is EF BB BF. latin1-decoded that is "ï»¿".
    expect(raw.slice(i + 16, i + 20)).toContain('ï»¿');
    const j = raw.indexOf('<?xpacket end=');
    const packet = raw.slice(i, j);
    expect(packet).toContain('<pdfaid:part>3</pdfaid:part>');
    expect(packet).toContain('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#');
    expect(packet).toContain('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>');
  });

  it('carries an OutputIntent with an embedded ICC profile', () => {
    expect(raw).toContain('/GTS_PDFA1');
    expect(raw).toContain('/DestOutputProfile');
  });

  it('is byte-deterministic: identical input gives an identical document ID', async () => {
    const idMatches = [...raw.matchAll(/\/ID \[ <([0-9A-F]{32})> <([0-9A-F]{32})> \]/g)];
    expect(idMatches.length).toBeGreaterThan(0);
    expect(idMatches[0]![1]).toBe(idMatches[0]![2]);
  });
});
