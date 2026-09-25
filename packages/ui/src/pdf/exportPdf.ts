import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { buildCII } from '@conformo/formats';
import { finalizePDFA, renderInvoicePage, type TemplateId, type RenderOptions } from '@conformo/pdf';
import { BASE_URL } from '../baseUrl.js';

export type EmbeddableLogo = NonNullable<RenderOptions['logo']>;

let fontCache: { regularBytes: ArrayBuffer; boldBytes: ArrayBuffer; iccBytes: ArrayBuffer } | undefined;

async function loadAssets() {
  if (fontCache) return fontCache;
  // BASE_URL (baseUrl.ts), not a hardcoded "/" — respects VITE_BASE_PATH
  // (vite.config.ts) so this still resolves when the app is deployed under a
  // subpath rather than a domain root.
  const base = BASE_URL;
  const [regularBytes, boldBytes, iccBytes] = await Promise.all([
    fetch(`${base}assets/fonts/WorkSans-Regular.ttf`).then((r) => r.arrayBuffer()),
    fetch(`${base}assets/fonts/WorkSans-Bold.ttf`).then((r) => r.arrayBuffer()),
    fetch(`${base}assets/sRGB.icc`).then((r) => r.arrayBuffer()),
  ]);
  fontCache = { regularBytes, boldBytes, iccBytes };
  return fontCache;
}

async function buildPage(invoice: Invoice, templateId: TemplateId, options: RenderOptions): Promise<PDFDocument> {
  const { regularBytes, boldBytes } = await loadAssets();
  const t = totals(invoice);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  await renderInvoicePage(pdf, { regular, bold }, invoice, t, templateId, options);
  return pdf;
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
  const xml = buildCII(invoice);
  const { iccBytes } = await loadAssets();
  const pdf = await buildPage(invoice, templateId, options);

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

/** Same page, without the PDF/A-3 wrapper (embedded XML, ICC profile, XMP
 * metadata) — for the live preview only, never for the downloaded file.
 * finalizePDFA never touches page content (see templates.ts's own docstring:
 * "a redesigned template must never change what invoice content means" is
 * the whole reason layout and PDF/A-3 compliance are separate steps), so
 * this looks pixel-identical to buildInvoicePdf()'s output; it's just a
 * smaller, simpler file for pdf.js to parse. That parse cost — not the
 * PDF-lib build side — was the actual bottleneck once this project went
 * back to a pdf.js canvas preview (measured ~1100ms on getDocument() alone,
 * dwarfing font-embed/render's ~100ms): the PDF/A wrapper adds a multi-KB
 * embedded XML attachment, an ICC color profile, and the AF/Names machinery
 * pdf.js has to index even though none of it is drawn. buildCII(invoice) is
 * still called for its validation side effect (throws InvoiceInputError for
 * a structurally incomplete invoice), so "can't render a preview yet" still
 * fires the same way it does for the real export. */
export async function buildPreviewPdf(
  invoice: Invoice,
  templateId: TemplateId,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  buildCII(invoice);
  const pdf = await buildPage(invoice, templateId, options);
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
