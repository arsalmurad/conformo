import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { buildCII } from '@conformo/formats';
import { finalizePDFA, renderInvoicePage, type TemplateId, type RenderOptions } from '@conformo/pdf';

export type EmbeddableLogo = NonNullable<RenderOptions['logo']>;

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
 * in Node, from the same @conformo/pdf renderer — proving the "renders
 * identically in the browser and in Node" hard requirement by construction,
 * not by eyeballing two implementations. */
export async function buildInvoicePdf(
  invoice: Invoice,
  templateId: TemplateId,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  const { regularBytes, boldBytes, iccBytes } = await loadAssets();
  const t = totals(invoice);
  const xml = buildCII(invoice);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });

  await renderInvoicePage(pdf, { regular, bold }, invoice, t, templateId, options);

  await finalizePDFA(pdf, {
    xml,
    xmlFilename: 'factur-x.xml',
    conformanceLevel: 'EN 16931',
    title: `Invoice ${invoice.number || 'draft'}`,
    author: invoice.seller.name || 'Conformo',
    producer: 'Conformo',
    creatorTool: 'Conformo',
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
