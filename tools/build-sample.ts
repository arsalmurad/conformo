/**
 * End-to-end smoke build: JSON invoice -> CII XML -> PDF/A-3 with the XML
 * embedded. Layout is packages/pdf's data-driven template renderer, the
 * same function packages/ui calls in the browser, proven here to also run
 * in Node, not two implementations that happen to agree.
 */
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { buildCII } from '@conformo/formats';
import { finalizePDFA, renderInvoicePage } from '@conformo/pdf';

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
  producer: 'Conformo', creatorTool: 'Conformo',
  iccProfile: fs.readFileSync(ICC),
  createDate: new Date(`${invoice.issueDate}T00:00:00Z`),
});
fs.writeFileSync('out/invoice.pdf', await pdf.save({ useObjectStreams: false }));
console.log('out/invoice.pdf + out/factur-x.xml');

// One hybrid PDF per Factur-X/ZUGFeRD profile Conformo can write. tools/validate.py checks each embedded XML against the
// profile's XSD and the Schematron, and tools/pdfa_audit.py checks the XMP (conformance level, file name) and PDF/A structure.
import { FACTURX_PROFILES } from '@conformo/pdf';
import type { FacturXProfile } from '@conformo/pdf';
const profiles: Record<FacturXProfile, string> = { en16931: 'sample-invoice.json', xrechnung: 'xrechnung-public-sector.json', extended: 'sample-invoice.json' };
const manifest: Record<string, { file: string; xml: string; level: string }> = {};
for (const [profile, fixture] of Object.entries(profiles) as [FacturXProfile, string][]) {
  const inv = JSON.parse(fs.readFileSync(`fixtures/${fixture}`, 'utf8')) as Invoice;
  const meta = FACTURX_PROFILES[profile];
  const profileXml = buildCII(inv, { profile });
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = { regular: await doc.embedFont(fs.readFileSync(`${FONTS}/WorkSans-Regular.ttf`), { subset: true }), bold: await doc.embedFont(fs.readFileSync(`${FONTS}/WorkSans-Bold.ttf`), { subset: true }) };
  await renderInvoicePage(doc, f, inv, totals(inv), TEMPLATE);
  await finalizePDFA(doc, {
    xml: profileXml, profile, title: `Invoice ${inv.number}`, author: inv.seller.name, producer: 'Conformo', creatorTool: 'Conformo',
    iccProfile: fs.readFileSync(ICC), createDate: new Date(`${inv.issueDate}T00:00:00Z`),
  });
  fs.writeFileSync(`out/invoice-${profile}.pdf`, await doc.save({ useObjectStreams: false }));
  manifest[profile] = { file: `out/invoice-${profile}.pdf`, xml: meta.xmlFilename, level: meta.conformanceLevel };
}
fs.writeFileSync('out/pdf-profiles.json', JSON.stringify(manifest, null, 2));
console.log('out/invoice-{en16931,xrechnung,extended}.pdf');
