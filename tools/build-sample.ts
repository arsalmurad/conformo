/**
 * End-to-end smoke build: JSON invoice -> CII XML -> PDF/A-3 with the XML
 * embedded. Layout is packages/pdf's data-driven template renderer (an earlier pass) —
 * the same function packages/ui calls in the browser, proven here to also run
 * in Node, not two implementations that happen to agree.
 */
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { totals } from '@invoice-engine/core';
import type { Invoice } from '@invoice-engine/core';
import { buildCII } from '@invoice-engine/formats';
import { finalizePDFA, renderInvoicePage } from '@invoice-engine/pdf';

const FONTS = process.env.FONT_DIR ?? './assets/fonts';
const ICC = process.env.ICC_PATH ?? './assets/sRGB.icc';
const TEMPLATE = (process.env.TEMPLATE as 'classic' | 'modern' | 'compact' | undefined) ?? 'classic';

const invoice = JSON.parse(fs.readFileSync('fixtures/sample-invoice.json', 'utf8')) as Invoice;
const t = totals(invoice);
const xml = buildCII(invoice);
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/factur-x.xml', xml);

const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const regular = await pdf.embedFont(fs.readFileSync(`${FONTS}/WorkSans-Regular.ttf`), { subset: true });
const bold = await pdf.embedFont(fs.readFileSync(`${FONTS}/WorkSans-Bold.ttf`), { subset: true });

await renderInvoicePage(pdf, { regular, bold }, invoice, t, TEMPLATE);

await finalizePDFA(pdf, {
  xml, xmlFilename: 'factur-x.xml', conformanceLevel: 'EN 16931',
  title: `Invoice ${invoice.number}`, author: invoice.seller.name,
  producer: 'invoice-engine', creatorTool: 'invoice-engine',
  iccProfile: fs.readFileSync(ICC),
  createDate: new Date(`${invoice.issueDate}T00:00:00Z`),
});
fs.writeFileSync('out/invoice.pdf', await pdf.save({ useObjectStreams: false }));
console.log('out/invoice.pdf + out/factur-x.xml');
