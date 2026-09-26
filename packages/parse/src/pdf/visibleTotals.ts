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
 * in packages/pdf/src/templates.ts renders unconditionally (Subtotal, Total,
 * Amount due, and Paid when there was a prepayment). It does not attempt to
 * OCR or lay out arbitrary third-party PDFs — a PDF from a different generator
 * that doesn't say "Amount due" simply reports checked: false, which the
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

/** The decimal mark is `.` or `,` depending on the invoice's locale
 * (packages/pdf/src/locale.ts's `formatInvoiceAmount` — grouping is off
 * there specifically so this regex never has to deal with a thousands
 * separator, which pdfjs's own whitespace collapsing would make ambiguous
 * against ordinary word spacing). */
function findMoney(text: string, label: string): { raw: string; minor: number } | undefined {
  const m = new RegExp(`\\b${label}\\s+(-?\\d+[.,]\\d{2})\\s+([A-Z]{3})\\b`).exec(text);
  if (!m) return undefined;
  const [, amount, currency] = m as unknown as [string, string, string];
  const minor = parseMoney(amount.replace(',', '.'));
  return { raw: `${amount} ${currency}`, minor };
}

export async function verifyVisibleTotals(pdfBytes: Uint8Array, invoice: Invoice): Promise<VisibleTotalsCheck> {
  const text = await pageText(pdfBytes);
  const t = totals(invoice);

  const checks: [string, string, number][] = [
    ['Subtotal', 'Subtotal', t.lineTotal],
    ['Total', 'Total', t.grand],
    ['Amount due', 'Amount due', t.due],
  ];
  if (t.prepaid) checks.push(['Paid', 'Paid', -t.prepaid]);

  const mismatches: TotalMismatch[] = [];
  let checked = false;
  for (const [regexLabel, label, expectedMinor] of checks) {
    const found = findMoney(text, regexLabel);
    if (!found) continue;
    checked = true;
    if (found.minor !== expectedMinor) {
      mismatches.push({ label, visibleText: found.raw, visibleMinor: found.minor, expectedMinor });
    }
  }
  return { checked, mismatches };
}
