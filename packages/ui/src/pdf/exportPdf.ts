import { PDFDocument, degrees, rgb, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { buildCII } from '@conformo/formats';
import { finalizePDFA, renderInvoicePage, type FacturXProfile, type TemplateId, type RenderOptions } from '@conformo/pdf';
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

async function buildPage(invoice: Invoice, templateId: TemplateId, options: RenderOptions, fonts: typeof fontkit = fontkit): Promise<PDFDocument> {
  return (await buildPageWithFonts(invoice, templateId, options, fonts)).pdf;
}

/**
 * fontkit with its parse step memoized per font file, for the live preview only. pdf-lib calls fontkit.create() on
 * the raw TTF bytes on every embed, and parsing the two 185 KB Work Sans files was most of the preview's build time
 * (~350 of ~470 ms per edit on a 4x-throttled CPU), which pushed edit-to-preview past its 500 ms budget on CI. The
 * parsed font is read-only input to subsetting, so reusing it changes nothing on the page. The downloaded PDF still
 * uses plain fontkit, so its bytes cannot be affected by this cache.
 */
const parsed = new Map<unknown, ReturnType<typeof fontkit.create>>();
const cachingFontkit: typeof fontkit = {
  ...fontkit,
  create: ((buffer: Uint8Array, postscriptName?: string) => {
    const key = buffer.byteLength + ':' + (postscriptName ?? '') + ':' + buffer[100] + buffer[1000] + buffer[10000];
    let f = parsed.get(key);
    if (!f) { f = fontkit.create(buffer, postscriptName); parsed.set(key, f); }
    return f;
  }) as typeof fontkit.create,
};

async function buildPageWithFonts(invoice: Invoice, templateId: TemplateId, options: RenderOptions, fonts: typeof fontkit = fontkit): Promise<{ pdf: PDFDocument; bold: PDFFont }> {
  const { regularBytes, boldBytes } = await loadAssets();
  const t = totals(invoice);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fonts);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  await renderInvoicePage(pdf, { regular, bold }, invoice, t, templateId, options);
  return { pdf, bold };
}

/** Builds the same PDF/A-3 Factur-X document tools/build-sample.ts produces
 * in Node, from the same @conformo/pdf renderer — proving the "renders
 * identically in the browser and in Node" hard requirement by construction,
 * not by eyeballing two implementations. */
export async function buildInvoicePdf(
  invoice: Invoice,
  templateId: TemplateId,
  options: RenderOptions = {},
  profile: FacturXProfile = 'en16931',
): Promise<Uint8Array> {
  const xml = buildCII(invoice, { profile });
  const { iccBytes } = await loadAssets();
  const pdf = await buildPage(invoice, templateId, options);

  await finalizePDFA(pdf, {
    xml,
    profile,
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
 * pdf.js has to index even though none of it is drawn. No buildCII() here:
 * it runs checkInvoice(), which rejects every blank required term (BT-1,
 * BT-27, BT-153...), and a draft has those until it is finished — gating
 * the preview on it left the canvas empty from the first keystroke to the
 * last. The validation summary already lists what is missing; the preview
 * shows the page as it stands. */
export async function buildPreviewPdf(
  invoice: Invoice,
  templateId: TemplateId,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  const pdf = await buildPage(invoice, templateId, options, cachingFontkit);
  return pdf.save({ useObjectStreams: false });
}

/**
 * "Download anyway" for an invoice that fails its rules: the page as it stands, stamped DRAFT on every page, with NO
 * embedded XML and no PDF/A-3 / Factur-X metadata. An invoice that fails XRechnung must never leave the app looking
 * like an XRechnung: a receiving system reads the embedded XML, not the stamp. Deterministic like everything else.
 */
export async function buildDraftPdf(
  invoice: Invoice,
  templateId: TemplateId,
  options: RenderOptions = {},
  stamp = 'DRAFT',
  notice = 'Draft: not a valid e-invoice',
): Promise<Uint8Array> {
  const { pdf, bold } = await buildPageWithFonts(invoice, templateId, options);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const size = 96;
    const w = bold.widthOfTextAtSize(stamp, size);
    page.drawText(stamp, {
      x: width / 2 - (w / 2) * Math.cos(Math.PI / 4) + (size / 2) * Math.sin(Math.PI / 4),
      y: height / 2 - (w / 2) * Math.sin(Math.PI / 4) - (size / 2) * Math.cos(Math.PI / 4),
      size, font: bold, color: rgb(0.75, 0.1, 0.1), opacity: 0.18, rotate: degrees(45),
    });
    page.drawText(notice, { x: 36, y: height - 22, size: 10, font: bold, color: rgb(0.75, 0.1, 0.1) });
  }
  pdf.setTitle(`${notice}: ${invoice.number || 'invoice'}`);
  // No clock in the document (determinism invariant): pdf-lib stamps "now" by default.
  const when = /^\d{4}-\d{2}-\d{2}$/.test(invoice.issueDate) ? new Date(`${invoice.issueDate}T00:00:00Z`) : new Date(0);
  pdf.setCreationDate(when);
  pdf.setModificationDate(when);
  pdf.setProducer('Conformo');
  pdf.setCreator('Conformo');
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
