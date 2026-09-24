import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { totals } from '@verinvoice/core';
import type { Invoice } from '@verinvoice/core';
import { buildCII } from '@verinvoice/formats';
import { finalizePDFA, renderInvoicePage } from '@verinvoice/pdf';
import { NoEmbeddedXmlError, extractEmbeddedXml, readInvoiceFromPdf } from '../packages/parse/src/index.js';

// Builds the exact PDF/A-3 tools/build-sample.ts produces, in memory, so this
// test does not depend on `npm run build:sample` having been run first.
async function buildSamplePdf(invoice: Invoice): Promise<Uint8Array> {
  const t = totals(invoice);
  const xml = buildCII(invoice);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fs.readFileSync('assets/fonts/WorkSans-Regular.ttf'), { subset: true });
  const bold = await pdf.embedFont(fs.readFileSync('assets/fonts/WorkSans-Bold.ttf'), { subset: true });
  await renderInvoicePage(pdf, { regular, bold }, invoice, t, 'classic');
  await finalizePDFA(pdf, {
    xml, xmlFilename: 'factur-x.xml', conformanceLevel: 'EN 16931',
    title: `Invoice ${invoice.number}`, author: invoice.seller.name,
    producer: 'Verinvoice', creatorTool: 'Verinvoice',
    iccProfile: fs.readFileSync('assets/sRGB.icc'),
    createDate: new Date(`${invoice.issueDate}T00:00:00Z`),
  });
  return pdf.save({ useObjectStreams: false });
}

const invoice = JSON.parse(fs.readFileSync('fixtures/sample-invoice.json', 'utf8')) as Invoice;

describe('extractEmbeddedXml(): the inverse of finalizePDFA()', () => {
  it('recovers the exact XML that was embedded', async () => {
    const xml = buildCII(invoice);
    const pdfBytes = await buildSamplePdf(invoice);
    const result = await extractEmbeddedXml(pdfBytes);
    expect(result.filename).toBe('factur-x.xml');
    expect(result.xml).toBe(xml);
  });

  it('rejects a PDF with no embedded files', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 200]);
    const bytes = await pdf.save();
    await expect(extractEmbeddedXml(bytes)).rejects.toThrow(NoEmbeddedXmlError);
  });
});

describe('readInvoiceFromPdf(): extraction + the visible-totals fraud check', () => {
  it('parses the embedded invoice and confirms the visible totals agree with it', async () => {
    const pdfBytes = await buildSamplePdf(invoice);
    const result = await readInvoiceFromPdf(pdfBytes);
    expect(result.format).toBe('cii');
    expect(result.invoice).toEqual(invoice);
    expect(result.visibleTotals.checked).toBe(true);
    expect(result.visibleTotals.mismatches).toEqual([]);
  });

  it('flags a mismatch when the embedded XML disagrees with the rendered page', async () => {
    // Render the page for one invoice, but embed a tampered XML (a different
    // amount due) as if the two had been swapped after the fact — the exact
    // fraud shape the project's own conventions calls out.
    const tampered: Invoice = { ...invoice, lines: invoice.lines.map((l) => ({ ...l, unitPriceMinor: l.unitPriceMinor * 2 })) };
    const t = totals(invoice); // totals for the ORIGINAL amounts, drawn on the page
    const tamperedXml = buildCII(tampered); // but the embedded XML says something else
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const regular = await pdf.embedFont(fs.readFileSync('assets/fonts/WorkSans-Regular.ttf'), { subset: true });
    const bold = await pdf.embedFont(fs.readFileSync('assets/fonts/WorkSans-Bold.ttf'), { subset: true });
    await renderInvoicePage(pdf, { regular, bold }, invoice, t, 'classic');
    await finalizePDFA(pdf, {
      xml: tamperedXml, xmlFilename: 'factur-x.xml', conformanceLevel: 'EN 16931',
      title: `Invoice ${invoice.number}`, author: invoice.seller.name,
      producer: 'Verinvoice', creatorTool: 'Verinvoice',
      iccProfile: fs.readFileSync('assets/sRGB.icc'),
      createDate: new Date(`${invoice.issueDate}T00:00:00Z`),
    });
    const pdfBytes = await pdf.save({ useObjectStreams: false });

    const result = await readInvoiceFromPdf(pdfBytes);
    expect(result.visibleTotals.checked).toBe(true);
    expect(result.visibleTotals.mismatches.length).toBeGreaterThan(0);
    expect(result.visibleTotals.mismatches.map((m) => m.label)).toContain('Amount due');
  });
});
