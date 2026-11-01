/**
 * Inverse of packages/formats/src/xml.ts's value formatters. Each reader below
 * calls exactly one of these per business term so a format change on the write
 * side has one obvious place to update on the read side too.
 */
import { fromMajor, priceFromMajor, totals } from '@conformo/core';
import type { Invoice } from '@conformo/core';
import type { Minor } from '@conformo/core';

/** Readers pass `text(el)!` for mandatory values. When the element is absent that is undefined, and the core
 * decimal parser would fail on it with a TypeError; a missing value must be the same RangeError as a malformed one. */
function present(text: string | undefined, what: string): string {
  if (text === undefined) throw new RangeError(`missing ${what}: the element is absent`);
  return text;
}

/** xs:decimal text -> Minor. Inverse of packages/formats/src/xml.ts's money(). */
export function parseMoney(text: string | undefined): Minor {
  return fromMajor(present(text, 'amount'));
}

/** xs:decimal text -> number. Inverse of dec()/decimalToString(). */
export function parseDec(text: string): number {
  const n = Number(text);
  if (!Number.isFinite(n)) throw new RangeError(`not a decimal number: ${JSON.stringify(text)}`);
  return n;
}

/** CII format-102 (yyyymmdd) -> ISO yyyy-mm-dd. Inverse of date102(). */
export function parseDate102(text: string): string {
  if (!/^\d{8}$/.test(text)) throw new RangeError(`not a format-102 date: ${JSON.stringify(text)}`);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/**
 * Every optional-array field on Invoice (notes, allowances, charges,
 * precedingInvoices) is written with `(field ?? []).map(...)`, so an absent
 * field and an empty one produce the same XML. Reading back `[]` would not
 * round-trip to the source's `undefined`, so every reader normalizes through
 * this instead of returning the mapped array directly.
 */
export function arrOrUndefined<T>(arr: T[]): T[] | undefined {
  return arr.length ? arr : undefined;
}

export interface ExemptionGroup {
  category: string;
  rate: number;
  code?: string;
  reason?: string;
}

/**
 * A line's own exemptionCode/exemptionReason (BT-120/BT-121) are an *input* to
 * totals(): they key which BG-23 breakdown group the line's net amount joins,
 * but neither CII nor UBL repeats them on the line element itself — only the
 * document-level breakdown carries them (see packages/core/src/totals.ts's
 * groupKey()). They are recoverable on read only when a line's (category, rate)
 * matches exactly one breakdown group; two lines sharing a category and rate but
 * citing different exemptions produce two groups with nothing left on either
 * line to say which is which, so that case is left unset rather than guessed.
 */
export function pickLineExemption(
  groups: ExemptionGroup[], category: string, rate: number,
): { code?: string; reason?: string } {
  const hits = groups.filter((g) => g.category === category && g.rate === rate);
  return hits.length === 1 ? { code: hits[0]!.code, reason: hits[0]!.reason } : {};
}

/** xs:decimal text of a unit price -> (possibly fractional) minor units. Inverse of price(). */
export function parsePrice(text: string | undefined): number {
  return priceFromMajor(present(text, 'price').trim());
}

/** A line id equal to its 1-based position is the writer's default, so reading it back leaves `id` unset. */
export function dropDefaultLineIds<T extends { id?: string }>(lines: T[]): T[] {
  lines.forEach((l, i) => { if (l.id === String(i + 1)) delete l.id; });
  return lines;
}

/**
 * Records a document's stated VAT amount per breakdown (BT-117) on the invoice when it differs from the amount computed
 * from the lines by exactly one minor unit (what EN 16931 tolerates). Bigger differences are not recorded: totals() would
 * ignore them anyway, and parse results report them (see packages/toolkit).
 */
export function attachStatedVat(inv: Invoice, stated: (ExemptionGroup & { amountMinor: number })[]): Invoice {
  let computed;
  try { computed = totals(inv).groups; } catch { return inv; }
  const diffs = stated.filter((s) => {
    const g = computed.find((c) => c.category === s.category && c.rate === s.rate && (c.exemptionCode ?? '') === (s.code ?? '') && (c.exemptionReason ?? '') === (s.reason ?? ''));
    return g !== undefined && g.amount !== s.amountMinor && Math.abs(g.amount - s.amountMinor) <= 1;
  });
  if (diffs.length) inv.statedVatAmounts = diffs.map((d) => ({ category: d.category as never, rate: d.rate, amountMinor: d.amountMinor, ...(d.code ? { exemptionCode: d.code } : {}), ...(d.reason ? { exemptionReason: d.reason } : {}) }));
  return inv;
}
