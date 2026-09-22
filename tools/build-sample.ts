/**
 * End-to-end smoke build: JSON invoice -> CII XML -> PDF/A-3 with the XML
 * embedded. The layout here is deliberately minimal. Replacing it with a real
 * template system is an earlier pass; do not let it grow here.
 */
import fs from 'node:fs';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { totals, toMajor, lineNet } from '@invoice-engine/core';
import type { Invoice } from '@invoice-engine/core';
import { buildCII } from '@invoice-engine/formats';
import { finalizePDFA } from '@invoice-engine/pdf';

const FONTS = process.env.FONT_DIR ?? './assets/fonts';
const ICC = process.env.ICC_PATH ?? './assets/sRGB.icc';

const invoice = JSON.parse(fs.readFileSync('fixtures/sample-invoice.json', 'utf8')) as Invoice;
const t = totals(invoice);
const xml = buildCII(invoice);
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/factur-x.xml', xml);

const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const reg = await pdf.embedFont(fs.readFileSync(`${FONTS}/WorkSans-Regular.ttf`), { subset: true });
const bold = await pdf.embedFont(fs.readFileSync(`${FONTS}/WorkSans-Bold.ttf`), { subset: true });

const W = 595.28, M = 48;
const page = pdf.addPage([W, 841.89]);
const ink = rgb(0.07, 0.08, 0.1), mute = rgb(0.45, 0.47, 0.52), line = rgb(0.88, 0.89, 0.91);
let y = 790;
const T = (s: unknown, x: number, yy: number, o: any = {}) =>
  page.drawText(String(s), { x, y: yy, font: o.f ?? reg, size: o.size ?? 9.5, color: o.color ?? ink });
const R = (s: unknown, xr: number, yy: number, o: any = {}) => {
  const f = o.f ?? reg, size = o.size ?? 9.5;
  T(s, xr - f.widthOfTextAtSize(String(s), size), yy, o);
};

T('INVOICE', M, y, { f: bold, size: 22 });
R(invoice.number, W - M, y + 4, { f: bold, size: 11 });
R(`Issued ${invoice.issueDate}   Due ${invoice.dueDate}`, W - M, y - 10, { size: 8.5, color: mute });
y -= 44;
page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: line });
y -= 24;
const block = (label: string, p: any, x: number) => {
  T(label.toUpperCase(), x, y, { size: 7.5, color: mute, f: bold });
  let yy = y - 14;
  for (const l of [p.name, p.street, `${p.postcode} ${p.city}`, p.country, `VAT ${p.vatId}`]) { T(l, x, yy, { size: 9 }); yy -= 12; }
};
block('From', invoice.seller, M);
block('Bill to', invoice.buyer, 320);
y -= 92;
T('DESCRIPTION', M, y, { size: 7.5, color: mute, f: bold });
R('QTY', 360, y, { size: 7.5, color: mute, f: bold });
R('UNIT PRICE', 450, y, { size: 7.5, color: mute, f: bold });
R('AMOUNT', W - M, y, { size: 7.5, color: mute, f: bold });
y -= 8;
page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: line });
y -= 18;
for (const l of invoice.lines) {
  T(l.name, M, y, { f: bold });
  if (l.description) T(l.description, M, y - 11, { size: 8, color: mute });
  R(String(l.quantity), 360, y);
  R(toMajor(l.unitPriceMinor), 450, y);
  R(toMajor(lineNet(l)), W - M, y);
  y -= 30;
}
page.drawLine({ start: { x: 320, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.7, color: line });
y -= 6;
const row = (label: string, val: string, o: any = {}) => {
  R(label, 470, y, { size: 9, color: o.mute ? mute : ink, f: o.f ?? reg });
  R(`${val} ${invoice.currency}`, W - M, y, { size: o.size ?? 9, f: o.f ?? reg });
  y -= 16;
};
row('Subtotal', toMajor(t.lineTotal), { mute: true });
for (const g of t.groups) row(`VAT ${g.rate}%`, toMajor(g.amount), { mute: true });
row('Total', toMajor(t.grand), { f: bold });
if (t.prepaid) row('Paid', `-${toMajor(t.prepaid)}`, { mute: true });
y -= 4;
row('Amount due', toMajor(t.due), { f: bold, size: 11 });
y -= 26;
T('PAYMENT', M, y, { size: 7.5, color: mute, f: bold });
T(`Bank transfer to IBAN ${invoice.payment.iban}`, M, y - 14, { size: 9 });
T(`Reference ${invoice.number}. ${invoice.paymentTerms}.`, M, y - 26, { size: 9, color: mute });
T('This PDF contains a Factur-X / EN 16931 electronic invoice embedded as XML.', M, 56, { size: 7.5, color: mute });

await finalizePDFA(pdf, {
  xml, xmlFilename: 'factur-x.xml', conformanceLevel: 'EN 16931',
  title: `Invoice ${invoice.number}`, author: invoice.seller.name,
  producer: 'invoice-engine', creatorTool: 'invoice-engine',
  iccProfile: fs.readFileSync(ICC),
  createDate: new Date(`${invoice.issueDate}T00:00:00Z`),
});
fs.writeFileSync('out/invoice.pdf', await pdf.save({ useObjectStreams: false }));
console.log('out/invoice.pdf + out/factur-x.xml');
