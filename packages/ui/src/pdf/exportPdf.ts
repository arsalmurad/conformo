import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { totals } from '@invoice-engine/core';
import type { Invoice } from '@invoice-engine/core';
import { buildCII } from '@invoice-engine/formats';
import { finalizePDFA, renderInvoicePage, type TemplateId } from '@invoice-engine/pdf';

let fontCache: { regularBytes: ArrayBuffer; boldBytes: ArrayBuffer; iccBytes: ArrayBuffer } | undefined;

async function loadAssets() {
  if (fontCache) return fontCache;
  const [regularBytes, boldBytes, iccBytes] = await Promise.all([
    fetch('/assets/fonts/WorkSans-Regular.ttf').then((r) => r.arrayBuffer()),
    fetch('/assets/fonts/WorkSans-Bold.ttf').then((r) => r.arrayBuffer()),
    fetch('/assets/sRGB.icc').then((r) => r.arrayBuffer()),
  ]);
  fontCache = { regularBytes, boldBytes, iccBytes };
  return fontCache;
}

/** Builds the same PDF/A-3 Factur-X document tools/build-sample.ts produces
 * in Node, from the same @invoice-engine/pdf renderer — proving the "renders
 * identically in the browser and in Node" hard requirement by construction,
 * not by eyeballing two implementations. */
export async function buildInvoicePdf(invoice: Invoice, templateId: TemplateId): Promise<Uint8Array> {
  const { regularBytes, boldBytes, iccBytes } = await loadAssets();
  const t = totals(invoice);
  const xml = buildCII(invoice);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });

  renderInvoicePage(pdf, { regular, bold }, invoice, t, templateId);

  await finalizePDFA(pdf, {
    xml,
    xmlFilename: 'factur-x.xml',
    conformanceLevel: 'EN 16931',
    title: `Invoice ${invoice.number || 'draft'}`,
    author: invoice.seller.name || 'invoice-engine',
    producer: 'invoice-engine',
    creatorTool: 'invoice-engine',
    iccProfile: new Uint8Array(iccBytes),
    createDate: new Date(`${invoice.issueDate}T00:00:00Z`),
  });

  return pdf.save({ useObjectStreams: false });
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
