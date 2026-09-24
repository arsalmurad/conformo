/**
 * Inverse of packages/formats/src/xml.ts's value formatters. Each reader below
 * calls exactly one of these per business term so a format change on the write
 * side has one obvious place to update on the read side too.
 */
import { fromMajor } from '@verinvoice/core';
import type { Minor } from '@verinvoice/core';

/** xs:decimal text -> Minor. Inverse of packages/formats/src/xml.ts's money(). */
export function parseMoney(text: string): Minor {
  return fromMajor(text);
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
