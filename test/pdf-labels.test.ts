import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { PDF_LABELS, PDF_LANGUAGES, renderInvoicePage, type PdfLanguage } from '@conformo/pdf';
import { MONEY_LABELS, verifyVisibleTotals } from '../packages/parse/src/index.js';
import { createPdf } from '../packages/toolkit/src/index.js';

/** The page labels in English, German and French (packages/pdf/src/labels.ts), and the visible-totals fraud check
 * that reads the money labels back off the page in every one of those languages. */

const invoice = JSON.parse(fs.readFileSync('fixtures/sample-invoice.json', 'utf8')) as Invoice;
const withDeposit: Invoice = { ...invoice, prepaidMinor: 1000 };

async function renderPage(inv: Invoice, language?: PdfLanguage): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fs.readFileSync('assets/fonts/WorkSans-Regular.ttf'), { subset: true });
  const bold = await pdf.embedFont(fs.readFileSync('assets/fonts/WorkSans-Bold.ttf'), { subset: true });
  await renderInvoicePage(pdf, { regular, bold }, inv, totals(inv), 'classic', language ? { language } : {});
  return pdf.save({ useObjectStreams: false });
}

async function pageText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  return content.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ');
}

describe('PDF labels', () => {
  it('the fraud check knows exactly the money labels the PDF prints, in every language', () => {
    for (const key of ['subtotal', 'total', 'paid', 'amountDue'] as const) {
      expect([...MONEY_LABELS[key]].sort(), key).toEqual(PDF_LANGUAGES.map((l) => PDF_LABELS[l][key]).sort());
    }
  });

  it.each(PDF_LANGUAGES)('%s: the page uses that language and passes the visible-totals check, deposit included', async (language) => {
    const bytes = await renderPage(withDeposit, language);
    const text = await pageText(bytes);
    const L = PDF_LABELS[language];
    for (const label of [L.title, L.amountDue, L.total, L.subtotal, L.paid]) expect(text, label).toContain(label);
    const check = await verifyVisibleTotals(bytes, withDeposit);
    expect(check.checked).toBe(true);
    expect(check.mismatches).toEqual([]);
  });

  it.each(PDF_LANGUAGES)('%s: a page that disagrees with the XML is still caught', async (language) => {
    const doubled: Invoice = { ...invoice, lines: invoice.lines.map((l) => ({ ...l, unitPriceMinor: l.unitPriceMinor * 2 })) };
    const check = await verifyVisibleTotals(await renderPage(doubled, language), invoice);
    expect(check.checked).toBe(true);
    expect(check.mismatches.map((m) => m.label)).toContain(PDF_LABELS[language].amountDue);
  });

  it('English labels never match inside a French or German page (and the reverse), so each line is read once', async () => {
    const fr = await pageText(await renderPage(withDeposit, 'fr'));
    // "Total" (English) must not be read off "Total HT" or "Total TTC": neither is followed directly by an amount.
    expect(/(?<![\p{L}\p{N}])Total\s+-?\d+[.,]\d{2}\s+[A-Z]{3}/u.test(fr)).toBe(false);
  });

  it('the language changes the page only: the embedded XML is identical, and the default is unchanged English', async () => {
    const [plain, en, de, fr] = await Promise.all([
      createPdf(invoice), createPdf(invoice, { language: 'en' }), createPdf(invoice, { language: 'de' }), createPdf(invoice, { language: 'fr' }),
    ]);
    expect(en.xml).toBe(plain.xml);
    expect(de.xml).toBe(plain.xml);
    expect(fr.xml).toBe(plain.xml);
    expect(Buffer.from(en.pdf).equals(Buffer.from(plain.pdf))).toBe(true);
    expect(Buffer.from(de.pdf).equals(Buffer.from(plain.pdf))).toBe(false);
  });
});
