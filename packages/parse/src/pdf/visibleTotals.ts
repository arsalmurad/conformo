/**
 * A fraud check: an invoice PDF carries two representations of the same
 * money — the page a human reads and
 * the embedded XML a machine posts to accounting. Nothing stops a bad actor
 * from handing you a PDF where the two disagree (a page edited after the fact,
 * or a PDF generator that never kept them in sync). This reads the PDF's own
 * rendered text with pdfjs-dist and compares it to totals computed from the
 * embedded XML's Invoice model, so a caller can refuse to trust either one
 * silently.
 *
 * Deliberately not exhaustive: it checks the four money lines every template
 * in packages/pdf/src/templates.ts renders unconditionally (subtotal, total,
 * amount due, and paid when there was a prepayment), in each page language
 * packages/pdf offers (English, German, French). It does not attempt to
 * OCR or lay out arbitrary third-party PDFs — a PDF from a different generator
 * that prints none of those labels simply reports checked: false, which the
 * caller should treat as "unverified", not "clean".
 */
import { totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import { parseMoney } from '../values.js';

export interface TotalMismatch {
  label: string;
  visibleText: string;
  visibleMinor: number;
  expectedMinor: number;
}

export interface VisibleTotalsCheck {
  /** False when the page has none of the recognized labels at all — an
   * unrelated or non-standard PDF, not evidence of tampering. */
  checked: boolean;
  mismatches: TotalMismatch[];
}

async function pageText(pdfBytes: Uint8Array): Promise<string> {
  // Dynamic import: pdfjs-dist is only needed by this one PDF-reading path,
  // not by every consumer of packages/parse (e.g. the pure-XML CLI/UI flows).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: pdfBytes, useSystemFonts: true }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return parts.join(' ').replace(/\s+/g, ' ');
}

/** The money labels packages/pdf prints, in every page language it offers (packages/pdf/src/labels.ts, PDF_LABELS).
 * Kept here as a copy so this package needs no dependency on @conformo/pdf; test/pdf-labels.test.ts fails if the two
 * drift apart. Order inside each list does not matter: a label only matches when the amount follows it directly. */
export const MONEY_LABELS = {
  subtotal: ['Subtotal', 'Nettobetrag', 'Total HT'],
  total: ['Total', 'Gesamtbetrag', 'Total TTC'],
  paid: ['Paid', 'Bereits bezahlt', 'Déjà payé'],
  amountDue: ['Amount due', 'Zahlbetrag', 'Net à payer'],
} as const;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The decimal mark is `.` or `,` depending on the invoice's locale
 * (packages/pdf/src/locale.ts's `formatInvoiceAmount` — grouping is off
 * there specifically so this regex never has to deal with a thousands
 * separator, which pdfjs's own whitespace collapsing would make ambiguous
 * against ordinary word spacing). */
function findMoney(text: string, label: string): { raw: string; minor: number } | undefined {
  // (?<![\p{L}\p{N}]) instead of \b: \b is ASCII-only in JavaScript, so it would misplace boundaries around labels
  // that start with an accented letter such as "Déjà payé".
  const m = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(label)}\\s+(-?\\d+[.,]\\d{2})\\s+([A-Z]{3})\\b`, 'u').exec(text);
  if (!m) return undefined;
  const [, amount, currency] = m as unknown as [string, string, string];
  const minor = parseMoney(amount.replace(',', '.'));
  return { raw: `${amount} ${currency}`, minor };
}

export async function verifyVisibleTotals(pdfBytes: Uint8Array, invoice: Invoice): Promise<VisibleTotalsCheck> {
  const text = await pageText(pdfBytes);
  const t = totals(invoice);

  const checks: [readonly string[], number][] = [
    [MONEY_LABELS.subtotal, t.lineTotal],
    [MONEY_LABELS.total, t.grand],
    [MONEY_LABELS.amountDue, t.due],
  ];
  if (t.prepaid) checks.push([MONEY_LABELS.paid, -t.prepaid]);

  const mismatches: TotalMismatch[] = [];
  let checked = false;
  for (const [labels, expectedMinor] of checks) {
    let label: string | undefined;
    let found: { raw: string; minor: number } | undefined;
    for (const candidate of labels) {
      found = findMoney(text, candidate);
      if (found) { label = candidate; break; }
    }
    if (!found || !label) continue;
    checked = true;
    if (found.minor !== expectedMinor) {
      mismatches.push({ label, visibleText: found.raw, visibleMinor: found.minor, expectedMinor });
    }
  }
  return { checked, mismatches };
}
