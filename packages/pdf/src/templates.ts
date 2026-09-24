/**
 * Data-driven invoice page layouts. One drawing algorithm, parameterized by a
 * `Theme` record, rather than three copy-pasted layout scripts — the same
 * positioning math produces three visibly different invoices depending on
 * which theme's colors, header style and density it's given. Runs unmodified
 * in Node (tools/build-sample.ts) and in the browser (packages/ui): pdf-lib
 * and fontkit are isomorphic, and this module touches neither `fs` nor `fetch`
 * — callers hand it already-loaded font/bytes, which is what makes the same
 * function usable from either environment (invariant 4).
 *
 * This is layout only. PDF/A-3 compliance (embedding the XML, the ICC
 * profile, the deterministic document ID) is `finalizePDFA`'s job, called
 * separately after the page is drawn — the two are independent for a reason:
 * a redesigned template must never change what invoice content means.
 */
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Invoice, Totals } from '@verinvoice/core';
import { lineNet } from '@verinvoice/core';
import { formatInvoiceAmount, formatInvoiceDate, localeForInvoice } from './locale.js';

export type TemplateId = 'classic' | 'modern' | 'compact';

export interface TemplateFonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface Theme {
  label: string;
  ink: readonly [number, number, number];
  mute: readonly [number, number, number];
  accent: readonly [number, number, number];
  line: readonly [number, number, number];
  /** Draws a colored band behind the title instead of plain text on white. */
  headerBand: boolean;
  /** Draws an accent-tinted box behind "Amount due" instead of plain text. */
  totalHighlight: boolean;
  /** Shrinks line-item row height and font size for invoices with many lines. */
  compact: boolean;
}

export const TEMPLATES: Record<TemplateId, Theme> = {
  classic: {
    label: 'Classic',
    ink: [0.07, 0.08, 0.1],
    mute: [0.45, 0.47, 0.52],
    accent: [0.07, 0.08, 0.1],
    line: [0.88, 0.89, 0.91],
    headerBand: false,
    totalHighlight: false,
    compact: false,
  },
  modern: {
    label: 'Modern',
    ink: [0.09, 0.09, 0.11],
    mute: [0.47, 0.49, 0.54],
    accent: [0.06, 0.32, 0.85],
    line: [0.9, 0.91, 0.96],
    headerBand: true,
    totalHighlight: true,
    compact: false,
  },
  compact: {
    label: 'Compact',
    ink: [0.1, 0.1, 0.1],
    mute: [0.4, 0.42, 0.46],
    accent: [0.15, 0.5, 0.35],
    line: [0.85, 0.86, 0.88],
    headerBand: false,
    totalHighlight: true,
    compact: true,
  },
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

export interface RenderOptions {
  /** Not part of the EN 16931 model (see packages/ui/src/editor/LogoUpload.tsx
   * and PaymentLinkField.tsx for why) — presentation-only extras drawn on
   * the page but never reflected in the embedded XML. `logo.bytes` must be
   * PNG or JPEG; pdf-lib has no WebP embedder. */
  logo?: { bytes: Uint8Array; kind: 'png' | 'jpeg' };
  paymentLink?: string;
}

export async function renderInvoicePage(
  pdf: PDFDocument,
  fonts: TemplateFonts,
  invoice: Invoice,
  totals: Totals,
  templateId: TemplateId = 'classic',
  options: RenderOptions = {},
): Promise<PDFPage> {
  const theme = TEMPLATES[templateId];
  const { regular: reg, bold } = fonts;
  const ink = rgb(...theme.ink);
  const mute = rgb(...theme.mute);
  const accent = rgb(...theme.accent);
  const line = rgb(...theme.line);
  const rowHeight = theme.compact ? 22 : 30;
  const baseSize = theme.compact ? 8.5 : 9.5;
  const locale = localeForInvoice(invoice.buyer.country, invoice.seller.country);
  const fmtDate = (iso: string) => formatInvoiceDate(iso, locale);
  const fmtAmount = (minor: number) => formatInvoiceAmount(minor, locale);

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const W = PAGE_WIDTH, M = MARGIN;

  const draw = (
    s: unknown,
    x: number,
    y: number,
    o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => page.drawText(String(s), { x, y, font: o.f ?? reg, size: o.size ?? baseSize, color: o.color ?? ink });
  const right = (
    s: unknown,
    xr: number,
    y: number,
    o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = o.f ?? reg, size = o.size ?? baseSize;
    draw(s, xr - f.widthOfTextAtSize(String(s), size), y, o);
  };
  const hr = (y: number, x0 = M, x1 = W - M) =>
    page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 0.7, color: line });

  const logoImage = options.logo
    ? options.logo.kind === 'png'
      ? await pdf.embedPng(options.logo.bytes)
      : await pdf.embedJpg(options.logo.bytes)
    : undefined;
  const headerShift = logoImage ? 30 : 0;
  const bandHeight = 96 + headerShift;

  let y = PAGE_HEIGHT - 51 - headerShift;

  if (logoImage) {
    const maxW = 90, maxH = 36;
    const scale = Math.min(maxW / logoImage.width, maxH / logoImage.height, 1);
    const w = logoImage.width * scale, h = logoImage.height * scale;
    page.drawImage(logoImage, { x: W - M - w, y: PAGE_HEIGHT - 20 - h, width: w, height: h });
  }

  if (theme.headerBand) {
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - bandHeight, width: W, height: bandHeight, color: accent });
    draw('INVOICE', M, y, { f: bold, size: 22, color: rgb(1, 1, 1) });
    right(invoice.number, W - M, y + 4, { f: bold, size: 11, color: rgb(1, 1, 1) });
    right(`Issued ${fmtDate(invoice.issueDate)}${invoice.dueDate ? `   Due ${fmtDate(invoice.dueDate)}` : ''}`, W - M, y - 10, {
      size: 8.5,
      color: rgb(0.85, 0.9, 1),
    });
    y = PAGE_HEIGHT - bandHeight - 24;
  } else {
    draw('INVOICE', M, y, { f: bold, size: 22 });
    right(invoice.number, W - M, y + 4, { f: bold, size: 11 });
    right(`Issued ${fmtDate(invoice.issueDate)}${invoice.dueDate ? `   Due ${fmtDate(invoice.dueDate)}` : ''}`, W - M, y - 10, {
      size: 8.5,
      color: mute,
    });
    y -= 44;
    hr(y);
    y -= 24;
  }

  const block = (label: string, p: Invoice['seller'], x: number) => {
    draw(label.toUpperCase(), x, y, { size: 7.5, color: mute, f: bold });
    let yy = y - 14;
    const addr = [p.street, [p.postcode, p.city].filter(Boolean).join(' ')].filter(Boolean);
    for (const l of [p.name, ...addr, p.country, p.vatId ? `VAT ${p.vatId}` : undefined].filter(Boolean)) {
      draw(l, x, yy, { size: 9 });
      yy -= 12;
    }
  };
  block('From', invoice.seller, M);
  block('Bill to', invoice.buyer, 320);
  y -= 92;

  draw('DESCRIPTION', M, y, { size: 7.5, color: mute, f: bold });
  right('QTY', 360, y, { size: 7.5, color: mute, f: bold });
  right('UNIT PRICE', 450, y, { size: 7.5, color: mute, f: bold });
  right('AMOUNT', W - M, y, { size: 7.5, color: mute, f: bold });
  y -= 8;
  hr(y);
  y -= theme.compact ? 14 : 18;

  invoice.lines.forEach((l, i) => {
    if (theme.compact && i % 2 === 1) {
      page.drawRectangle({ x: M - 4, y: y - 7, width: W - 2 * M + 8, height: rowHeight - 4, color: line, opacity: 0.35 });
    }
    draw(l.name, M, y, { f: bold, size: baseSize });
    if (l.description && !theme.compact) draw(l.description, M, y - 11, { size: 8, color: mute });
    right(String(l.quantity), 360, y, { size: baseSize });
    right(fmtAmount(l.unitPriceMinor), 450, y, { size: baseSize });
    right(fmtAmount(lineNet(l)), W - M, y, { size: baseSize });
    y -= rowHeight;
  });

  hr(y + 8, 320);
  y -= 6;

  const row = (label: string, val: string, o: { mute?: boolean; f?: PDFFont; size?: number } = {}) => {
    right(label, 470, y, { size: 9, color: o.mute ? mute : ink, f: o.f ?? reg });
    right(`${val} ${invoice.currency}`, W - M, y, { size: o.size ?? 9, f: o.f ?? reg });
    y -= 16;
  };

  if (theme.totalHighlight) {
    page.drawRectangle({ x: 320, y: y - totals.groups.length * 16 - 26, width: W - M - 320, height: totals.groups.length * 16 + 44, color: accent, opacity: 0.06 });
  }

  row('Subtotal', fmtAmount(totals.lineTotal), { mute: true });
  for (const g of totals.groups) row(`VAT ${g.rate}%`, fmtAmount(g.amount), { mute: true });
  row('Total', fmtAmount(totals.grand), { f: bold });
  if (totals.prepaid) row('Paid', `-${fmtAmount(totals.prepaid)}`, { mute: true });
  y -= 4;
  right('Amount due', 470, y, { size: 11, f: bold, color: theme.totalHighlight ? accent : ink });
  right(`${fmtAmount(totals.due)} ${invoice.currency}`, W - M, y, { size: 11, f: bold, color: theme.totalHighlight ? accent : ink });
  y -= 26;

  draw('PAYMENT', M, y, { size: 7.5, color: mute, f: bold });
  if (invoice.payment.iban) draw(`Bank transfer to IBAN ${invoice.payment.iban}`, M, y - 14, { size: 9 });
  draw(`Reference ${invoice.number}.${invoice.paymentTerms ? ` ${invoice.paymentTerms}.` : ''}`, M, y - 26, { size: 9, color: mute });
  y -= 26;
  if (options.paymentLink) {
    draw(`Pay online: ${options.paymentLink}`, M, y - 12, { size: 9, color: accent });
    y -= 12;
  }

  const note = invoice.notes?.[0]?.text;
  if (note) {
    draw(note, M, y - 24, { size: 8, color: mute });
  }

  draw('This PDF contains a Factur-X / EN 16931 electronic invoice embedded as XML.', M, 56, { size: 7.5, color: mute });

  return page;
}
