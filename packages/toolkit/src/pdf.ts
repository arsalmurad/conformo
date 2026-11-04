import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { assertInvoice, totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { buildCII, buildXRechnungCII } from '@conformo/formats';
import { FACTURX_PROFILES, finalizePDFA, renderInvoicePage } from '@conformo/pdf';
import type { FacturXProfile, PdfLanguage, RenderOptions, TemplateId } from '@conformo/pdf';
import { loadPdfAssets } from './assets.js';

/** Page label languages createPdf accepts (re-exported from @conformo/pdf). */
export { PDF_LANGUAGES } from '@conformo/pdf';
export type { PdfLanguage } from '@conformo/pdf';

export const PDF_PROFILES = ['en16931', 'xrechnung', 'extended'] as const satisfies readonly FacturXProfile[];

export interface CreatedPdf {
  /** PDF/A-3b with the XML embedded. Byte-identical for identical input. */
  pdf: Uint8Array;
  xml: string;
  profile: FacturXProfile;
  /** Name of the embedded XML (factur-x.xml, or xrechnung.xml for the XRECHNUNG profile). */
  xmlFilename: string;
  /** fx:ConformanceLevel written to the XMP packet. */
  conformanceLevel: string;
}

export interface CreatePdfOptions {
  /** en16931 = Factur-X / ZUGFeRD EN 16931 (COMFORT); xrechnung = ZUGFeRD XRECHNUNG profile; extended = EXTENDED. Default en16931. */
  profile?: FacturXProfile;
  template?: TemplateId;
  logo?: RenderOptions['logo'];
  /** Language of the printed labels: 'en' (default), 'de' or 'fr'. The embedded XML is identical in every language. */
  language?: PdfLanguage;
}

/**
 * A hybrid invoice: a readable PDF/A-3b with the structured XML embedded. No headless browser involved. The
 * document is deterministic: its timestamps come from the invoice's issue date, never from a clock.
 */
export async function createPdf(invoice: Invoice, options: CreatePdfOptions = {}): Promise<CreatedPdf> {
  assertInvoice(invoice);
  const profile = options.profile ?? 'en16931';
  const xml = profile === 'xrechnung' ? buildXRechnungCII(invoice) : buildCII(invoice, { profile });
  const assets = loadPdfAssets();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(assets.regular, { subset: true });
  const bold = await doc.embedFont(assets.bold, { subset: true });
  await renderInvoicePage(doc, { regular, bold }, invoice, totals(invoice), options.template ?? 'classic', {
    ...(options.logo ? { logo: options.logo } : {}),
    ...(options.language ? { language: options.language } : {}),
  });
  await finalizePDFA(doc, {
    xml, profile,
    title: `Invoice ${invoice.number}`, author: invoice.seller.name, producer: 'Conformo', creatorTool: 'Conformo',
    iccProfile: assets.icc, createDate: new Date(`${invoice.issueDate}T00:00:00Z`),
  });
  const meta = FACTURX_PROFILES[profile];
  return { pdf: await doc.save({ useObjectStreams: false }), xml, profile, xmlFilename: meta.xmlFilename, conformanceLevel: meta.conformanceLevel };
}
